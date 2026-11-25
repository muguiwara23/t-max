' Tareas de red. Las listas grandes se guardan por grupo en cachefs: para no llenar la memoria del Roku.

sub init()
    m.top.functionName = "work"
end sub

sub work()
    req = m.top.request
    out = { ok: false, kind: req.kind, error: "", tag: req.tag }
    try
        src = req.src
        if req.kind = "groups" then
            if src.type = "xtream" then
                xtreamGroups(src, out)
            else if src.type = "m3u" then
                m3uLoad(src, out)
            else
                stalkerLoad(src, out)
            end if
        else if req.kind = "channels" then
            channels(src, req.group, out)
        else if req.kind = "link" then
            stalkerLink(src, req.cmd, out)
        else if req.kind = "epg" then
            epg(src, req.ch, out)
        else if req.kind = "vodCats" then
            vodCats(src, req.vod, out)
        else if req.kind = "vodList" then
            vodList(src, req.vod, req.cat, out)
        else if req.kind = "vodSearch" then
            vodSearch(src, req.vod, req.q, out)
        else if req.kind = "movieInfo" then
            movieInfo(src, req.id, out)
        else if req.kind = "seriesInfo" then
            seriesInfo(src, req.id, out)
        else if req.kind = "watchdog" then
            t = stalkerToken(src, false)
            if t <> "" then HttpGet(StalkerApi(src.server) + "?type=watchdog&action=get_events&event_active_id=0&init=0&cur_play_type=1&JsHttpRequest=1-xml", StalkerHeaders(src, t), 15000)
            out.ok = true
        end if
    catch e
        out.error = e.message
    end try
    m.top.result = out
end sub

function cacheFile(src as object, group as string) as string
    return "cachefs:/c_" + src.id + "_" + CreateObject("roByteArray").FromAsciiString(group).ToHexString() + ".json"
end function

sub fail(out as object, r as object, what as string)
    if r.code = 401 or r.code = 403 then
        out.error = what + ": acceso denegado (revisa usuario, contraseña o MAC)"
    else if r.code < 0 then
        out.error = what + ": " + r.reason
    else
        out.error = what + ": el servidor respondió " + r.code.ToStr()
    end if
end sub

' ---------- Xtream ----------

sub xtreamGroups(src as object, out as object)
    r = HttpGet(XtreamApi(src, "get_live_categories"), {}, 30000)
    if r.code <> 200 then
        fail(out, r, "Grupos")
        return
    end if
    list = ParseJson(r.body)
    groups = []
    if type(list) = "roArray" then
        for each c in list
            groups.push({ id: Txt(c.category_id), name: Txt(c.category_name) })
        end for
    end if
    out.groups = groups
    out.ok = true
end sub

sub channels(src as object, group as string, out as object)
    if src.type <> "xtream" then
        f = cacheFile(src, group)
        v = ParseJson(ReadAsciiFile(f))
        if type(v) <> "roArray" then
            out.error = "Actualiza la fuente: no hay canales guardados."
            return
        end if
        out.channels = v
        out.ok = true
        return
    end if
    r = HttpGet(XtreamApi(src, "get_live_streams") + "&category_id=" + Esc(group), {}, 60000)
    if r.code <> 200 then
        fail(out, r, "Canales")
        return
    end if
    list = ParseJson(r.body)
    r.body = ""
    chs = []
    if type(list) = "roArray" then
        for each c in list
            chs.push({ n: Txt(c.name), num: Txt(c.num), id: Txt(c.stream_id), logo: Txt(c.stream_icon) })
        end for
    end if
    out.channels = chs
    out.ok = true
end sub

' ---------- M3U: se descarga, se reparte por grupo y se guarda ----------

sub m3uLoad(src as object, out as object)
    f = "cachefs:/m3u_" + src.id + ".txt"
    x = CreateObject("roUrlTransfer")
    x.SetUrl(src.url)
    if LCase(Left(src.url, 6)) = "https:" then
        x.SetCertificatesFile("common:/certs/ca-bundle.crt")
        x.InitClientCertificates()
    end if
    code = x.GetToFile(f)
    if code <> 200 then
        out.error = "Lista: el servidor respondió " + code.ToStr()
        return
    end if
    text = ReadAsciiFile(f)
    CreateObject("roFileSystem").Delete(f)
    lines = text.Split(Chr(10))
    text = ""
    byGroup = {}
    order = []
    cur = invalid
    reGroup = CreateObject("roRegex", "group-title=" + Chr(34) + "([^" + Chr(34) + "]*)" + Chr(34), "i")
    reLogo = CreateObject("roRegex", "tvg-logo=" + Chr(34) + "([^" + Chr(34) + "]*)" + Chr(34), "i")
    n = 0
    for each raw in lines
        l = raw.Trim()
        if Left(l, 7) = "#EXTINF" then
            g = "Sin grupo"
            mg = reGroup.Match(l)
            if mg.Count() > 1 and mg[1] <> "" then g = mg[1]
            logo = ""
            ml = reLogo.Match(l)
            if ml.Count() > 1 then logo = ml[1]
            comma = l.Instr(Chr(34) + ",")
            name = ""
            if comma >= 0 then
                name = Mid(l, comma + 3).Trim()
            else
                c2 = Instr(1, l, ",")
                if c2 > 0 then name = Mid(l, c2 + 1).Trim()
            end if
            cur = { n: name, g: g, logo: logo }
        else if cur <> invalid and l <> "" and Left(l, 1) <> "#" then
            n = n + 1
            if not byGroup.DoesExist(cur.g) then
                byGroup[cur.g] = []
                order.push(cur.g)
            end if
            byGroup[cur.g].push({ n: cur.n, num: n.ToStr(), url: l, logo: cur.logo })
            cur = invalid
        end if
    end for
    if n = 0 then
        out.error = "La lista no tiene canales válidos."
        return
    end if
    groups = []
    for each g in order
        WriteAsciiFile(cacheFile(src, g), FormatJson(byGroup[g]))
        groups.push({ id: g, name: g })
    end for
    out.groups = groups
    out.ok = true
end sub

' ---------- Stalker ----------

function stalkerToken(src as object, fresh as boolean) as string
    reg = CreateObject("roRegistrySection", "tmax")
    key = "stk_" + src.id
    now = CreateObject("roDateTime").AsSeconds()
    if not fresh and reg.Exists(key) then
        v = ParseJson(reg.Read(key))
        if v <> invalid and now - v.at < 1200 then return v.token
    end if
    api = StalkerApi(src.server)
    pre = Sha1Upper(UCase(src.mac))
    r = HttpGet(api + "?type=stb&action=handshake&token=&prehash=" + pre + "&JsHttpRequest=1-xml", StalkerHeaders(src, ""), 20000)
    j = ParseJson(r.body)
    token = ""
    random = ""
    if j <> invalid and j.js <> invalid then
        token = Txt(j.js.token)
        random = Txt(j.js.random)
    end if
    if token = "" then return ""
    metrics = FormatJson({ mac: UCase(src.mac), model: "MAG250", type: "STB", random: random })
    ver = "ImageDescription: 0.2.18-r14-pub-250; ImageDate: Fri Jan 15 15:20:44 EET 2016; PORTAL version: 5.6.0; API Version: JS API version: 328; STB API version: 134; Player Engine version: 0x566"
    q = "?type=stb&action=get_profile&ver=" + Esc(ver) + "&stb_type=MAG250&hw_version=1.7-BD-00&image_version=218&client_type=STB&num_banks=2&video_out=hdmi&hd=1&not_valid_token=0&auth_second_step=0&metrics=" + Esc(metrics) + "&prehash=" + pre + "&JsHttpRequest=1-xml"
    HttpGet(api + q, StalkerHeaders(src, token), 20000)
    reg.Write(key, FormatJson({ token: token, at: now }))
    reg.Flush()
    return token
end function

sub stalkerLoad(src as object, out as object)
    token = stalkerToken(src, true)
    if token = "" then
        out.error = "El portal no entregó sesión (¿MAC no registrada?)."
        return
    end if
    api = StalkerApi(src.server)
    h = StalkerHeaders(src, token)
    r = HttpGet(api + "?type=itv&action=get_genres&JsHttpRequest=1-xml", h, 30000)
    names = {}
    order = []
    j = ParseJson(r.body)
    if j <> invalid and type(j.js) = "roArray" then
        for each g in j.js
            gid = Txt(g.id)
            if gid <> "" and gid <> "*" then
                names[gid] = Txt(g.title)
                order.push(gid)
            end if
        end for
    end if
    r = HttpGet(api + "?type=itv&action=get_all_channels&JsHttpRequest=1-xml", h, 120000)
    if r.code <> 200 then
        fail(out, r, "Canales")
        return
    end if
    j = ParseJson(r.body)
    r.body = ""
    if j = invalid or j.js = invalid then
        out.error = "El portal no devolvió canales."
        return
    end if
    data = j.js
    if type(data) = "roAssociativeArray" then data = data.data
    by = {}
    for each c in data
        gid = Txt(c.tv_genre_id)
        if not by.DoesExist(gid) then by[gid] = []
        by[gid].push({ n: Txt(c.name), num: Txt(c.number), cmd: Txt(c.cmd), logo: Txt(c.logo), sid: Txt(c.id) })
    end for
    groups = []
    for each gid in order
        if by.DoesExist(gid) then
            WriteAsciiFile(cacheFile(src, gid), FormatJson(by[gid]))
            groups.push({ id: gid, name: names[gid] })
        end if
    end for
    for each gid in by
        if not names.DoesExist(gid) then
            WriteAsciiFile(cacheFile(src, gid), FormatJson(by[gid]))
            groups.push({ id: gid, name: "Otros" })
        end if
    end for
    out.groups = groups
    out.ok = true
end sub

sub stalkerLink(src as object, cmd as string, out as object)
    for attempt = 0 to 1
        token = stalkerToken(src, attempt = 1)
        if token <> "" then
            r = HttpGet(StalkerApi(src.server) + "?type=itv&action=create_link&cmd=" + StalkerCmd(cmd) + "&series=&forced_storage=undefined&disable_ad=0&download=0&JsHttpRequest=1-xml", StalkerHeaders(src, token), 20000)
            j = ParseJson(r.body)
            if j <> invalid and j.js <> invalid then
                link = StripCmd(Txt(j.js.cmd))
                if link <> "" and Instr(1, link, "://localhost") = 0 and Instr(1, link, "://127.0.0.1") = 0 then
                    out.link = link
                    out.ok = true
                    return
                end if
            end if
        end if
    end for
    out.error = "El portal no dio el enlace del canal."
end sub

' ---------- Guía: lo que pasa ahora y lo que sigue (pedido al servidor, canal por canal) ----------

sub epg(src as object, ch as object, out as object)
    list = []
    if src.type = "xtream" and Txt(ch.id) <> "" then
        r = HttpGet(XtreamApi(src, "get_short_epg") + "&stream_id=" + Esc(Txt(ch.id)) + "&limit=6", {}, 15000)
        j = ParseJson(r.body)
        if j <> invalid and type(j.epg_listings) = "roArray" then
            for each p in j.epg_listings
                list.push({ t: B64(Txt(p.title)), d: B64(Txt(p.description)), s: IntOf(p.start_timestamp), e: IntOf(p.stop_timestamp) })
            end for
        end if
    else if src.type = "stalker" and Txt(ch.sid) <> "" then
        token = stalkerToken(src, false)
        if token <> "" then
            r = HttpGet(StalkerApi(src.server) + "?type=itv&action=get_short_epg&ch_id=" + Esc(Txt(ch.sid)) + "&size=6&JsHttpRequest=1-xml", StalkerHeaders(src, token), 15000)
            j = ParseJson(r.body)
            if j <> invalid and type(j.js) = "roArray" then
                for each p in j.js
                    list.push({ t: Txt(p.name), d: Txt(p.descr), s: IntOf(p.start_timestamp), e: IntOf(p.stop_timestamp) })
                end for
            end if
        end if
    end if
    now = NowSecs()
    keep = []
    for each p in list
        if p.e > now and p.t <> "" then keep.push(p)
    end for
    out.list = keep
    out.ok = true
end sub

' ---------- Películas y series (Xtream) ----------

function vodAction(vod as string, what as string) as string
    if vod = "series" then
        if what = "cats" then return "get_series_categories"
        return "get_series"
    end if
    if what = "cats" then return "get_vod_categories"
    return "get_vod_streams"
end function

sub vodCats(src as object, vod as string, out as object)
    r = HttpGet(XtreamApi(src, vodAction(vod, "cats")), {}, 30000)
    if r.code <> 200 then
        fail(out, r, "Categorías")
        return
    end if
    list = ParseJson(r.body)
    cats = []
    if type(list) = "roArray" then
        for each c in list
            cats.push({ id: Txt(c.category_id), name: Txt(c.category_name) })
        end for
    end if
    out.cats = cats
    out.ok = true
end sub

function vodItem(vod as string, c as object) as object
    if vod = "series" then return { id: Txt(c.series_id), n: Txt(c.name), i: Txt(c.cover) }
    return { id: Txt(c.stream_id), n: Txt(c.name), i: Txt(c.stream_icon), x: Txt(c.container_extension) }
end function

sub vodList(src as object, vod as string, cat as string, out as object)
    r = HttpGet(XtreamApi(src, vodAction(vod, "list")) + "&category_id=" + Esc(cat), {}, 60000)
    if r.code <> 200 then
        fail(out, r, "Catálogo")
        return
    end if
    list = ParseJson(r.body)
    r.body = ""
    items = []
    if type(list) = "roArray" then
        for each c in list
            items.push(vodItem(vod, c))
            if items.Count() >= 3000 then exit for
        end for
    end if
    out.items = items
    out.ok = true
end sub

' Búsqueda: baja el catálogo completo una vez, lo guarda compacto en cachefs y filtra ahí.
sub vodSearch(src as object, vod as string, q as string, out as object)
    f = "cachefs:/s_" + src.id + "_" + vod + ".json"
    all = ParseJson(ReadAsciiFile(f))
    if type(all) <> "roArray" then
        r = HttpGet(XtreamApi(src, vodAction(vod, "list")), {}, 120000)
        if r.code <> 200 then
            fail(out, r, "Búsqueda")
            return
        end if
        list = ParseJson(r.body)
        r.body = ""
        all = []
        if type(list) = "roArray" then
            for each c in list
                all.push(vodItem(vod, c))
            end for
        end if
        list = invalid
        WriteAsciiFile(f, FormatJson(all))
    end if
    needle = LCase(q.Trim())
    items = []
    for each it in all
        if Instr(1, LCase(it.n), needle) > 0 then
            items.push(it)
            if items.Count() >= 200 then exit for
        end if
    end for
    out.items = items
    out.ok = true
end sub

sub movieInfo(src as object, id as string, out as object)
    r = HttpGet(XtreamApi(src, "get_vod_info") + "&vod_id=" + Esc(id), {}, 30000)
    j = ParseJson(r.body)
    if r.code <> 200 or j = invalid then
        fail(out, r, "Ficha")
        return
    end if
    info = j.info
    if type(info) <> "roAssociativeArray" then info = {}
    md = j.movie_data
    if type(md) <> "roAssociativeArray" then md = {}
    year = Left(Txt(info.releasedate), 4)
    if year = "" then year = Txt(info.year)
    cover = Txt(info.cover_big)
    if cover = "" then cover = Txt(info.movie_image)
    out.info = { id: id, n: Txt(md.name), plot: Txt(info.plot), year: year, dur: IntOf(info.duration_secs), genre: Txt(info.genre), cast: Txt(info.cast), director: Txt(info.director), rating: Txt(info.rating), cover: cover, x: Txt(md.container_extension) }
    if out.info.n = "" then out.info.n = Txt(info.name)
    out.ok = true
end sub

sub seriesInfo(src as object, id as string, out as object)
    r = HttpGet(XtreamApi(src, "get_series_info") + "&series_id=" + Esc(id), {}, 60000)
    j = ParseJson(r.body)
    r.body = ""
    if r.code <> 200 or j = invalid then
        fail(out, r, "Ficha")
        return
    end if
    info = j.info
    if type(info) <> "roAssociativeArray" then info = {}
    year = Left(Txt(info.releaseDate), 4)
    out.info = { id: id, n: Txt(info.name), plot: Txt(info.plot), year: year, genre: Txt(info.genre), cast: Txt(info.cast), rating: Txt(info.rating), cover: Txt(info.cover) }
    ' Temporadas → episodios. Algunos paneles mandan un objeto por temporada y otros una lista.
    bySeason = {}
    eps = j.episodes
    groups = []
    if type(eps) = "roAssociativeArray" then
        for each k in eps
            groups.push(eps[k])
        end for
    else if type(eps) = "roArray" then
        groups = eps
    end if
    for each g in groups
        if type(g) = "roArray" then
            for each e in g
                se = IntOf(e.season)
                key = se.ToStr()
                if not bySeason.DoesExist(key) then bySeason[key] = { n: se, eps: [] }
                ei = e.info
                if type(ei) <> "roAssociativeArray" then ei = {}
                bySeason[key].eps.push({ id: Txt(e.id), n: IntOf(e.episode_num), t: Txt(e.title), x: Txt(e.container_extension), d: IntOf(ei.duration_secs) })
            end for
        end if
    end for
    seasons = []
    for each k in bySeason
        s = bySeason[k]
        s.eps.SortBy("n")
        seasons.push(s)
    end for
    seasons.SortBy("n")
    out.seasons = seasons
    out.ok = true
end sub
