' Pruebas de red del POC: Xtream (login, canales, película) y Stalker (handshake, perfil, enlace).
' Mide tiempos, tamaño de respuesta y memoria del Roku. Nunca escribe contraseñas en el registro de resultados.

sub init()
    m.top.functionName = "doWork"
end sub

sub doWork()
    req = m.top.request
    out = { ok: false, log: [], channels: [], kind: req.kind }
    try
        if req.kind = "xtream" then
            xtreamLoad(req, out)
        else if req.kind = "vod" then
            vodFirst(req, out)
        else if req.kind = "stalker" then
            stalkerTest(req, out)
        else if req.kind = "stalkerLink" then
            stalkerLink(req, out)
        end if
    catch e
        out.log.push("ERROR: " + e.message)
    end try
    m.top.result = out
end sub

' ---------- utilidades ----------

function memText() as string
    mon = CreateObject("roAppMemoryMonitor")
    s = "memoria: " + CreateObject("roDeviceInfo").GetGeneralMemoryLevel()
    if mon <> invalid then
        s = s + " · disponible " + Str(mon.GetChannelAvailableMemory()).Trim() + " KB · uso " + Str(mon.GetMemoryLimitPercent()).Trim() + "%"
    end if
    return s
end function

' GET con cabeceras; devuelve { code, body, ms, bytes }.
function httpGet(url as string, headers as object, timeoutMs as integer) as object
    t = CreateObject("roTimespan")
    x = CreateObject("roUrlTransfer")
    x.SetUrl(url)
    x.SetCertificatesFile("common:/certs/ca-bundle.crt")
    x.InitClientCertificates()
    x.EnableEncodings(true)
    x.RetainBodyOnError(true)
    for each k in headers
        x.AddHeader(k, headers[k])
    end for
    port = CreateObject("roMessagePort")
    x.SetMessagePort(port)
    x.AsyncGetToString()
    msg = wait(timeoutMs, port)
    if type(msg) = "roUrlEvent" then
        body = msg.GetString()
        return { code: msg.GetResponseCode(), body: body, ms: t.TotalMilliseconds(), bytes: Len(body), reason: msg.GetFailureReason() }
    end if
    x.AsyncCancel()
    return { code: -1, body: "", ms: t.TotalMilliseconds(), bytes: 0, reason: "tiempo agotado" }
end function

function trimSlash(s as string) as string
    while Len(s) > 0 and Right(s, 1) = "/"
        s = Left(s, Len(s) - 1)
    end while
    return s
end function

function xtreamBase(server as string) as string
    s = server.Trim()
    if LCase(Left(s, 4)) <> "http" then s = "http://" + s
    s = trimSlash(s)
    i = Instr(1, s, "/player_api.php")
    if i > 0 then s = Left(s, i - 1)
    return s
end function

function enc(s as string) as string
    return CreateObject("roUrlTransfer").Escape(s)
end function

function api(req as object, action as string) as string
    u = xtreamBase(req.server) + "/player_api.php?username=" + enc(req.user) + "&password=" + enc(req.pass)
    if action <> "" then u = u + "&action=" + action
    return u
end function

' ---------- Xtream ----------

sub xtreamLoad(req as object, out as object)
    out.log.push("Inicio · " + memText())
    r = httpGet(api(req, ""), {}, 20000)
    out.log.push("Login: HTTP " + Str(r.code).Trim() + " en " + Str(r.ms).Trim() + " ms")
    if r.code <> 200 then
        out.log.push("Falló el login (" + r.reason + ")")
        return
    end if
    j = ParseJson(r.body)
    if j <> invalid and j.user_info <> invalid then
        ui = j.user_info
        fmts = ""
        if ui.allowed_output_formats <> invalid then
            for each f in ui.allowed_output_formats
                fmts = fmts + f + " "
            end for
        end if
        out.log.push("Cuenta: " + toS(ui.status) + " · formatos: " + fmts + "· conexiones máx: " + toS(ui.max_connections))
    end if

    r = httpGet(api(req, "get_live_streams"), {}, 120000)
    out.log.push("Canales: HTTP " + Str(r.code).Trim() + " · " + Str(Int(r.bytes / 1024)).Trim() + " KB en " + Str(r.ms).Trim() + " ms")
    if r.code <> 200 then return
    t = CreateObject("roTimespan")
    list = ParseJson(r.body)
    r.body = ""
    if list = invalid then
        out.log.push("La respuesta no es JSON válido")
        return
    end if
    out.log.push("JSON: " + Str(list.Count()).Trim() + " canales procesados en " + Str(t.TotalMilliseconds()).Trim() + " ms · " + memText())
    n = 0
    for each c in list
        out.channels.push({ name: toS(c.name), id: toS(c.stream_id) })
        n = n + 1
        if n >= 400 then exit for
    end for
    out.base = xtreamBase(req.server)
    out.ok = true
end sub

sub vodFirst(req as object, out as object)
    r = httpGet(api(req, "get_vod_streams"), {}, 120000)
    out.log.push("Películas: HTTP " + Str(r.code).Trim() + " · " + Str(Int(r.bytes / 1024)).Trim() + " KB en " + Str(r.ms).Trim() + " ms")
    if r.code <> 200 then return
    list = ParseJson(r.body)
    r.body = ""
    if list = invalid or list.Count() = 0 then
        out.log.push("Sin películas")
        return
    end if
    out.log.push(Str(list.Count()).Trim() + " películas · " + memText())
    n = 0
    for each v in list
        ext = toS(v.container_extension)
        if ext = "" then ext = "mp4"
        out.channels.push({ name: toS(v.name) + "  [" + ext + "]", id: toS(v.stream_id), ext: ext })
        n = n + 1
        if n >= 200 then exit for
    end for
    out.base = xtreamBase(req.server)
    out.ok = true
end sub

function toS(v as dynamic) as string
    if v = invalid then return ""
    t = type(v)
    if t = "roString" or t = "String" then return v
    if t = "roInt" or t = "Integer" or t = "roInteger" or t = "LongInteger" then return Str(v).Trim()
    if t = "roFloat" or t = "Float" or t = "Double" or t = "roDouble" then return Str(v).Trim()
    if t = "roBoolean" or t = "Boolean" then
        if v then return "true"
        return "false"
    end if
    return ""
end function

' ---------- Stalker ----------

function stalkerApi(portal as string) as string
    u = portal.Trim()
    if LCase(Left(u, 4)) <> "http" then u = "http://" + u
    if Instr(1, LCase(u), ".php") > 0 then
        q = Instr(1, u, "?")
        if q > 0 then u = Left(u, q - 1)
        return u
    end if
    u = trimSlash(u)
    if LCase(Right(u, 2)) = "/c" then u = Left(u, Len(u) - 2)
    if LCase(Right(u, 15)) = "/stalker_portal" then return u + "/server/load.php"
    return u + "/portal.php"
end function

function stalkerHeaders(mac as string, tz as string, token as string) as object
    h = {
        "User-Agent": "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3",
        "X-User-Agent": "Model: MAG250; Link: WiFi",
        "Cookie": "mac=" + enc(UCase(mac)) + "; stb_lang=es; timezone=" + enc(tz)
    }
    if token <> "" then h["Authorization"] = "Bearer " + token
    return h
end function

sub stalkerTest(req as object, out as object)
    apiUrl = stalkerApi(req.portal)
    tz = "America/Mexico_City"
    r = httpGet(apiUrl + "?type=stb&action=handshake&token=&JsHttpRequest=1-xml", stalkerHeaders(req.mac, tz, ""), 20000)
    out.log.push("Handshake: HTTP " + Str(r.code).Trim() + " en " + Str(r.ms).Trim() + " ms")
    j = ParseJson(r.body)
    token = ""
    if j <> invalid and j.js <> invalid then token = toS(j.js.token)
    if token = "" then
        out.log.push("El portal no dio token (¿MAC no registrada?)")
        return
    end if
    h = stalkerHeaders(req.mac, tz, token)
    r = httpGet(apiUrl + "?type=stb&action=get_profile&hd=1&stb_type=MAG250&JsHttpRequest=1-xml", h, 20000)
    out.log.push("Perfil: HTTP " + Str(r.code).Trim())
    r = httpGet(apiUrl + "?type=itv&action=get_all_channels&JsHttpRequest=1-xml", h, 120000)
    out.log.push("Canales: HTTP " + Str(r.code).Trim() + " · " + Str(Int(r.bytes / 1024)).Trim() + " KB en " + Str(r.ms).Trim() + " ms")
    j = ParseJson(r.body)
    r.body = ""
    if j = invalid or j.js = invalid then return
    data = j.js
    if type(data) = "roAssociativeArray" and data.data <> invalid then data = data.data
    n = 0
    for each c in data
        out.channels.push({ name: toS(c.name), id: toS(c.id), cmd: toS(c.cmd) })
        n = n + 1
        if n >= 400 then exit for
    end for
    out.log.push(Str(n).Trim() + " canales (primeros 400) · " + memText())
    out.token = token
    out.api = apiUrl
    out.ok = true
end sub

' create_link justo antes de reproducir (el enlace caduca).
sub stalkerLink(req as object, out as object)
    h = stalkerHeaders(req.mac, "America/Mexico_City", req.token)
    url = req.api + "?type=itv&action=create_link&cmd=" + enc(req.cmd) + "&series=&forced_storage=undefined&disable_ad=0&download=0&JsHttpRequest=1-xml"
    r = httpGet(url, h, 20000)
    out.log.push("create_link: HTTP " + Str(r.code).Trim() + " en " + Str(r.ms).Trim() + " ms")
    j = ParseJson(r.body)
    link = ""
    if j <> invalid and j.js <> invalid then link = toS(j.js.cmd)
    sp = Instr(1, link, " ")
    if sp > 0 and LCase(Left(link, 4)) <> "http" then link = Mid(link, sp + 1).Trim()
    out.link = link
    out.ok = link <> ""
end sub
