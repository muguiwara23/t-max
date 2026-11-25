' Navegación de T-Max en Roku (mismo diseño que iPhone/iPad).
' Foco: rail → list → (grid | detail/seasons) → video → tracks.

sub init()
    m.rail = m.top.findNode("rail")
    m.list = m.top.findNode("list")
    m.listHead = m.top.findNode("listHead")
    m.leftPanel = m.top.findNode("leftPanel")
    m.title = m.top.findNode("title")
    m.subtitle = m.top.findNode("subtitle")
    m.clock = m.top.findNode("clock")
    m.liveRight = m.top.findNode("liveRight")
    m.vodRight = m.top.findNode("vodRight")
    m.setRight = m.top.findNode("setRight")
    m.previewHint = m.top.findNode("previewHint")
    m.nowPill = m.top.findNode("nowPill")
    m.nowTime = m.top.findNode("nowTime")
    m.nowTitle = m.top.findNode("nowTitle")
    m.nowDesc = m.top.findNode("nowDesc")
    m.nextInfo = m.top.findNode("nextInfo")
    m.progBg = m.top.findNode("progBg")
    m.progFill = m.top.findNode("progFill")
    m.grid = m.top.findNode("grid")
    m.gridMsg = m.top.findNode("gridMsg")
    m.detail = m.top.findNode("detail")
    m.dCover = m.top.findNode("dCover")
    m.dTitle = m.top.findNode("dTitle")
    m.dMeta = m.top.findNode("dMeta")
    m.dPlot = m.top.findNode("dPlot")
    m.dCast = m.top.findNode("dCast")
    m.dSeasons = m.top.findNode("dSeasons")
    m.dList = m.top.findNode("dList")
    m.video = m.top.findNode("video")
    m.hud = m.top.findNode("hud")
    m.hudTitle = m.top.findNode("hudTitle")
    m.hudClock = m.top.findNode("hudClock")
    m.hudNow = m.top.findNode("hudNow")
    m.hudNowTitle = m.top.findNode("hudNowTitle")
    m.hudProg = m.top.findNode("hudProg")
    m.hudNext = m.top.findNode("hudNext")
    m.msgBox = m.top.findNode("msgBox")
    m.msgText = m.top.findNode("msgText")
    m.tracks = m.top.findNode("tracks")
    m.tList = m.top.findNode("tList")
    m.setSteps = m.top.findNode("setSteps")
    m.setUrl = m.top.findNode("setUrl")
    m.setPin = m.top.findNode("setPin")
    m.setInfo = m.top.findNode("setInfo")
    m.wd = m.top.findNode("watchdog")
    m.hudTimer = m.top.findNode("hudTimer")
    m.msgTimer = m.top.findNode("msgTimer")
    m.epgTimer = m.top.findNode("epgTimer")
    m.catTimer = m.top.findNode("catTimer")
    m.clockTimer = m.top.findNode("clockTimer")

    m.reg = CreateObject("roRegistrySection", "tmax")
    m.sources = LoadSources()
    m.srcIndex = 0
    if m.reg.Exists("srcIndex") then m.srcIndex = m.reg.Read("srcIndex").ToInt()
    if m.srcIndex >= m.sources.Count() then m.srcIndex = 0
    m.tasks = {}
    m.epg = {}
    m.vodCache = {}
    m.vodCacheOrder = []
    m.prog = invalid
    m.liveMode = "groups"
    m.playSeq = 0
    m.full = false
    m.vodMode = false
    m.section = -1

    m.rail.observeField("itemFocused", "onRailFocus")
    m.rail.observeField("itemSelected", "onRailSelect")
    m.list.observeField("itemSelected", "onListSelect")
    m.list.observeField("itemFocused", "onListFocus")
    m.grid.observeField("itemSelected", "onGridSelect")
    m.dList.observeField("itemSelected", "onDListSelect")
    m.dSeasons.observeField("itemFocused", "onSeasonFocus")
    m.tList.observeField("itemSelected", "onTrackSelect")
    m.video.observeField("state", "onVideoState")
    m.video.observeField("position", "onVideoPos")
    m.video.notificationInterval = 2
    m.wd.observeField("fire", "onWatchdog")
    m.hudTimer.observeField("fire", "hideHud")
    m.msgTimer.observeField("fire", "hideMsg")
    m.epgTimer.observeField("fire", "onEpgTimer")
    m.catTimer.observeField("fire", "onCatTimer")
    m.clockTimer.observeField("fire", "onClock")
    m.clockTimer.control = "start"
    onClock()

    ' Página para el celular (solo red local, con PIN).
    m.pin = Pad2(Rnd(99)) + Pad2(Rnd(99) - 1)
    m.web = CreateObject("roSGNode", "WebServer")
    m.web.pin = m.pin
    m.web.observeField("changed", "onWebChanged")
    m.web.control = "run"

    m.railItems = [
        { t: "En vivo", i: "pkg:/images/ic_live.png" },
        { t: "Películas", i: "pkg:/images/ic_movies.png" },
        { t: "Series", i: "pkg:/images/ic_series.png" },
        { t: "Ajustes", i: "pkg:/images/ic_settings.png" }
    ]
    first = 0
    if m.sources.Count() = 0 then first = 3
    drawRail(first)
    m.rail.jumpToItem = first
    m.focus = "rail"
    m.rail.setFocus(true)
    showSection(first)
end sub

' ---------- utilidades ----------

function curSrc() as dynamic
    if m.sources.Count() = 0 then return invalid
    return m.sources[m.srcIndex]
end function

function Sv(v as dynamic) as string
    if v = invalid then return ""
    return Txt(v)
end function

function makeRows(rows as object) as object
    c = CreateObject("roSGNode", "ContentNode")
    for each r in rows
        it = c.createChild("ContentNode")
        it.title = Sv(r.t)
        if r.logo <> invalid then it.HDPosterUrl = r.logo
        it.addFields({ num: Sv(r.num), sub: Sv(r.sub), right: Sv(r.right), icon: Sv(r.icon), on: Sv(r.on) })
    end for
    return c
end function

sub runTask(req as object, cb as string)
    t = CreateObject("roSGNode", "WorkTask")
    t.observeField("result", cb)
    t.request = req
    t.control = "run"
    m.tasks[req.kind] = t
end sub

sub onClock()
    t = HhMm(0)
    m.clock.text = t
    m.hudClock.text = t
    if m.section = 0 and m.liveMode = "channels" and m.focusCh <> invalid then renderInfo(m.focusCh)
    if m.hud.visible then renderHud()
end sub

sub showMsg(text as string, autoHide as boolean)
    if m.full or m.vodMode then
        m.msgBox.translation = [560, 470]
    else
        m.msgBox.translation = [1048, 322]
    end if
    m.msgText.text = text
    m.msgBox.visible = true
    m.msgTimer.control = "stop"
    if autoHide then m.msgTimer.control = "start"
end sub

sub hideMsg()
    m.msgBox.visible = false
end sub

' ---------- barra lateral y secciones ----------

sub drawRail(current as integer)
    c = CreateObject("roSGNode", "ContentNode")
    for i = 0 to m.railItems.Count() - 1
        it = c.createChild("ContentNode")
        it.title = m.railItems[i].t
        it.HDPosterUrl = m.railItems[i].i
        if i = current then it.ShortDescriptionLine1 = "1" else it.ShortDescriptionLine1 = "0"
    end for
    m.rail.content = c
end sub

sub markRail(current as integer)
    c = m.rail.content
    if c = invalid then return
    for i = 0 to c.getChildCount() - 1
        if i = current then c.getChild(i).ShortDescriptionLine1 = "1" else c.getChild(i).ShortDescriptionLine1 = "0"
    end for
end sub

sub onRailFocus()
    if m.focus <> "rail" then return
    showSection(m.rail.itemFocused)
end sub

sub onRailSelect()
    focusContent()
end sub

sub focusRail()
    m.focus = "rail"
    m.rail.setFocus(true)
end sub

sub focusList()
    m.focus = "list"
    m.list.setFocus(true)
end sub

sub focusContent()
    if m.list.content <> invalid and m.list.content.getChildCount() > 0 then focusList()
end sub

sub setLeftWide(wide as boolean)
    if wide then
        m.leftPanel.width = 760
        m.listHead.width = 700
        m.list.itemSize = [736, 84]
        m.list.numRows = 9
    else
        m.leftPanel.width = 448
        m.listHead.width = 400
        m.list.itemSize = [424, 72]
        m.list.numRows = 10
    end if
end sub

sub showSection(i as integer)
    if i = m.section then return
    if m.section = 0 then stopLive()
    m.section = i
    markRail(i)
    m.liveRight.visible = false
    m.vodRight.visible = false
    m.setRight.visible = false
    m.detail.visible = false
    hideMsg()
    if i = 0 then
        showLive()
    else if i = 1 then
        showVod("movie")
    else if i = 2 then
        showVod("series")
    else
        showSettings()
    end if
end sub

' ---------- TV en vivo ----------

sub showLive()
    m.listMode = "live"
    setLeftWide(true)
    m.liveRight.visible = true
    m.title.text = "TV en vivo"
    s = curSrc()
    if s = invalid then
        m.subtitle.text = "Sin fuentes"
        m.listHead.text = ""
        m.list.content = makeRows([])
        clearInfo("Agrega tu primera fuente en Ajustes. Lo más cómodo: desde el celular.")
        return
    end if
    hint = ""
    if m.sources.Count() > 1 then hint = "  ·  * en Grupos = cambiar de fuente"
    m.subtitle.text = s.name + hint
    if m.groupsFor = s.id and m.groups <> invalid then
        if m.liveMode = "channels" and m.channels <> invalid then
            showChannels(m.lastCh)
        else
            showGroups()
        end if
        return
    end if
    m.groups = invalid
    m.liveMode = "groups"
    m.listHead.text = "Cargando grupos…"
    m.list.content = makeRows([])
    clearInfo("Conectando con " + s.name + "…")
    runTask({ kind: "groups", src: s, tag: s.id }, "onGroups")
end sub

sub onGroups(ev as object)
    r = ev.getData()
    s = curSrc()
    if s = invalid or r.tag <> s.id or m.section <> 0 then return
    if not r.ok then
        m.listHead.text = "No se pudo cargar"
        clearInfo(r.error)
        return
    end if
    m.groups = r.groups
    m.groupsFor = s.id
    m.groupIdx = 0
    showGroups()
end sub

sub showGroups()
    rows = [{ t: "Favoritos", icon: "pkg:/images/ic_star.png" }]
    for each g in m.groups
        rows.push({ t: g.name })
    end for
    m.liveMode = "groups"
    m.listHead.text = "Grupos · " + m.groups.Count().ToStr()
    m.list.content = makeRows(rows)
    if m.groupIdx <> invalid then m.list.jumpToItem = m.groupIdx
    m.focusCh = invalid
    if not livePlaying() then clearInfo("Elige un grupo y luego un canal. OK en un canal = vista previa; OK otra vez = pantalla completa.")
end sub

function livePlaying() as boolean
    return m.video.visible and not m.vodMode
end function

sub openGroup(i as integer)
    m.groupIdx = i
    if i = 0 then
        m.channels = favorites()
        m.groupName = "Favoritos"
        m.channelsKey = "fav"
        showChannels(0)
        return
    end if
    g = m.groups[i - 1]
    m.groupName = g.name
    m.listHead.text = g.name + " · cargando…"
    runTask({ kind: "channels", src: curSrc(), group: g.id, tag: curSrc().id + "|" + g.id }, "onChannels")
end sub

sub onChannels(ev as object)
    r = ev.getData()
    if m.section <> 0 or curSrc() = invalid then return
    if not r.ok then
        m.listHead.text = m.groupName
        showMsg(r.error, true)
        return
    end if
    m.channels = r.channels
    m.channelsKey = r.tag
    showChannels(0)
end sub

function chKey(c as object) as string
    return favKey(c)
end function

function epgNow(c as object) as dynamic
    e = m.epg[chKey(c)]
    if e = invalid then return invalid
    now = NowSecs()
    for each p in e.list
        if p.s <= now and p.e > now then return p
    end for
    return invalid
end function

function chRow(c as object) as object
    sub1 = ""
    p = epgNow(c)
    if p <> invalid then sub1 = p.t
    icon = ""
    if isFav(c) then icon = "pkg:/images/ic_star.png"
    onv = ""
    if livePlaying() and m.playList <> invalid and m.playIndex <> invalid and m.playList[m.playIndex] <> invalid and chKey(m.playList[m.playIndex]) = chKey(c) then onv = "1"
    return { t: c.n, num: c.num, logo: c.logo, sub: sub1, icon: icon, on: onv }
end function

sub showChannels(focusIdx as dynamic)
    rows = []
    for each c in m.channels
        rows.push(chRow(c))
    end for
    m.liveMode = "channels"
    m.listHead.text = m.groupName + " · " + m.channels.Count().ToStr() + " canales"
    m.list.content = makeRows(rows)
    if m.channels.Count() = 0 then
        clearInfo("No hay canales aquí. En un canal, el botón * lo agrega a Favoritos.")
        return
    end if
    if focusIdx = invalid or focusIdx >= m.channels.Count() then focusIdx = 0
    m.list.jumpToItem = focusIdx
    m.lastCh = focusIdx
    m.focusCh = m.channels[focusIdx]
    renderInfo(m.focusCh)
    m.epgTimer.control = "stop"
    m.epgTimer.control = "start"
end sub

sub onListFocus()
    i = m.list.itemFocused
    if m.section = 0 and m.liveMode = "channels" and m.channels <> invalid and i >= 0 and i < m.channels.Count() then
        m.lastCh = i
        m.focusCh = m.channels[i]
        renderInfo(m.focusCh)
        m.epgTimer.control = "stop"
        m.epgTimer.control = "start"
    else if (m.section = 1 or m.section = 2) and m.listMode = "cats" then
        m.catTimer.control = "stop"
        m.catTimer.control = "start"
    end if
end sub

sub onEpgTimer()
    if m.focusCh <> invalid then fetchEpg(m.focusCh)
end sub

sub fetchEpg(c as object)
    s = curSrc()
    if s = invalid or s.type = "m3u" then return
    k = chKey(c)
    e = m.epg[k]
    if e <> invalid and NowSecs() - e.at < 300 then return
    t = CreateObject("roSGNode", "WorkTask")
    t.observeField("result", "onEpg")
    t.request = { kind: "epg", src: s, ch: c, tag: k }
    t.control = "run"
    m.tasks["epg" + k] = t
end sub

sub onEpg(ev as object)
    r = ev.getData()
    m.tasks.Delete("epg" + r.tag)
    if not r.ok then return
    m.epg[r.tag] = { at: NowSecs(), list: r.list }
    if m.epg.Count() > 300 then m.epg = {}
    if m.section <> 0 then return
    ' actualizar la línea "ahora" de la fila
    if m.liveMode = "channels" and m.channels <> invalid and m.list.content <> invalid then
        for i = 0 to m.channels.Count() - 1
            if chKey(m.channels[i]) = r.tag then
                p = epgNow(m.channels[i])
                if p <> invalid and i < m.list.content.getChildCount() then m.list.content.getChild(i).sub = p.t
                exit for
            end if
        end for
    end if
    if m.focusCh <> invalid and chKey(m.focusCh) = r.tag then renderInfo(m.focusCh)
    if m.hud.visible then renderHud()
end sub

sub clearInfo(text as string)
    m.nowPill.visible = false
    m.nowTime.text = ""
    m.nowTitle.text = ""
    m.nowDesc.text = text
    m.nextInfo.text = ""
    m.progBg.visible = false
    m.progFill.visible = false
end sub

sub renderInfo(c as object)
    s = curSrc()
    e = m.epg[chKey(c)]
    p = epgNow(c)
    m.nowTitle.text = c.n
    if p <> invalid then
        now = NowSecs()
        m.nowPill.visible = true
        mins = Int((p.e - now) / 60)
        m.nowTime.text = HhMm(p.s) + " – " + HhMm(p.e) + "  ·  quedan " + mins.ToStr() + " min"
        m.nowTitle.text = p.t
        m.nowDesc.text = p.d
        m.progBg.visible = true
        m.progFill.visible = true
        m.progFill.width = Int(840 * (now - p.s) / (p.e - p.s))
    else
        m.nowPill.visible = false
        m.progBg.visible = false
        m.progFill.visible = false
        if s <> invalid and s.type = "m3u" then
            m.nowTime.text = "Sin guía"
            m.nowDesc.text = "Las listas M3U todavía no traen guía en Roku."
        else if e = invalid then
            m.nowTime.text = "Cargando guía…"
            m.nowDesc.text = ""
        else
            m.nowTime.text = "Sin información de guía"
            m.nowDesc.text = ""
        end if
    end if
    m.nextInfo.text = nextText(c, 2, "  ·  ")
end sub

function nextText(c as object, n as integer, sep as string) as string
    e = m.epg[chKey(c)]
    if e = invalid then return ""
    now = NowSecs()
    out = ""
    k = 0
    for each p in e.list
        if p.s > now and k < n then
            if out <> "" then out = out + sep
            out = out + HhMm(p.s) + "  " + p.t
            k = k + 1
        end if
    end for
    if out = "" then return ""
    return "Después:  " + out
end function

' ---------- favoritos (registro, compacto) ----------

function favKey(c as object) as string
    k = c.id
    if k = invalid or k = "" then k = c.cmd
    if k = invalid or k = "" then k = c.url
    sid = ""
    if curSrc() <> invalid then sid = curSrc().id
    return sid + "|" + Sv(k)
end function

function favList() as object
    if not m.reg.Exists("favs") then return []
    v = ParseJson(m.reg.Read("favs"))
    if type(v) <> "roArray" then return []
    return v
end function

function isFav(c as object) as boolean
    k = favKey(c)
    for each f in favList()
        if f.k = k then return true
    end for
    return false
end function

sub toggleFav(c as object)
    k = favKey(c)
    out = []
    found = false
    for each f in favList()
        if f.k = k then found = true else out.push(f)
    end for
    if not found then out.push({ k: k, n: c.n, num: c.num, id: c.id, cmd: c.cmd, url: c.url, logo: c.logo, sid: c.sid, s: curSrc().id })
    m.reg.Write("favs", FormatJson(out))
    m.reg.Flush()
end sub

function favorites() as object
    out = []
    for each f in favList()
        if f.s = curSrc().id then out.push(f)
    end for
    return out
end function

' ---------- reproducción en vivo ----------

sub videoPreview()
    m.video.translation = [1000, 140]
    m.video.width = 896
    m.video.height = 504
end sub

sub videoFull()
    m.video.translation = [0, 0]
    m.video.width = 1920
    m.video.height = 1080
end sub

sub preview(i as integer)
    m.playList = m.channels
    m.playIndex = i
    m.retries = 0
    startLive()
    refreshOnFlags()
end sub

sub refreshOnFlags()
    if m.liveMode <> "channels" or m.list.content = invalid or m.channels = invalid then return
    for i = 0 to m.channels.Count() - 1
        if i < m.list.content.getChildCount() then
            onv = ""
            if livePlaying() and m.playList[m.playIndex] <> invalid and chKey(m.playList[m.playIndex]) = chKey(m.channels[i]) then onv = "1"
            m.list.content.getChild(i).on = onv
        end if
    end for
end sub

sub startLive()
    c = m.playList[m.playIndex]
    s = curSrc()
    m.vodMode = false
    m.playSeq = m.playSeq + 1
    m.video.enableUI = false
    if m.full then videoFull() else videoPreview()
    m.video.visible = true
    m.previewHint.visible = false
    showMsg(c.n + " · conectando…", false)
    fetchEpg(c)
    if s.type = "stalker" then
        runTask({ kind: "link", src: s, cmd: c.cmd, tag: m.playSeq }, "onLink")
        return
    end if
    if s.type = "xtream" then
        ext = "ts"
        if s.fmt = "m3u8" then ext = "m3u8"
        url = XtreamBase(s.server) + "/live/" + Esc(s.user) + "/" + Esc(s.pass) + "/" + c.id + "." + ext
    else
        url = c.url
    end if
    playLiveUrl(url, invalid)
end sub

sub onLink(ev as object)
    r = ev.getData()
    if r.tag <> m.playSeq or not livePlaying() then return
    if not r.ok then
        showMsg(r.error, false)
        return
    end if
    s = curSrc()
    playLiveUrl(r.link, ["User-Agent: " + MagAgent(), "Cookie: " + StalkerHeaders(s, "").Cookie])
    m.wd.control = "start"
end sub

sub playLiveUrl(url as string, headers as dynamic)
    s = curSrc()
    content = CreateObject("roSGNode", "ContentNode")
    content.url = url
    content.title = m.playList[m.playIndex].n
    content.live = true
    content.streamFormat = FormatFor(url, Sv(s.fmt))
    if headers <> invalid then content.HttpHeaders = headers
    m.playStarted = false
    m.video.content = content
    m.video.control = "play"
end sub

sub goFull()
    m.full = true
    videoFull()
    m.focus = "video"
    m.video.setFocus(true)
    hideMsg()
    showHud()
end sub

sub exitFull()
    m.full = false
    videoPreview()
    hideHud()
    hideMsg()
    m.focus = "list"
    m.list.setFocus(true)
    if m.liveMode = "channels" and m.channels <> invalid then
        for i = 0 to m.channels.Count() - 1
            if chKey(m.channels[i]) = chKey(m.playList[m.playIndex]) then
                m.list.jumpToItem = i
                exit for
            end if
        end for
        refreshOnFlags()
    end if
end sub

sub stopLive()
    if m.vodMode then return
    m.video.control = "stop"
    m.video.visible = false
    m.wd.control = "stop"
    m.full = false
    videoPreview()
    hideHud()
    hideMsg()
    m.previewHint.visible = true
    m.playSeq = m.playSeq + 1
end sub

sub zap(d as integer)
    n = m.playList.Count()
    if n = 0 then return
    m.playIndex = (m.playIndex + d + n) mod n
    m.retries = 0
    startLive()
    showHud()
end sub

sub showHud()
    renderHud()
    m.hud.visible = true
    m.hudTimer.control = "stop"
    m.hudTimer.control = "start"
end sub

sub hideHud()
    m.hud.visible = false
end sub

sub renderHud()
    if m.playList = invalid then return
    c = m.playList[m.playIndex]
    num = Sv(c.num)
    if num <> "" then num = num + "  ·  "
    m.hudTitle.text = num + c.n
    p = epgNow(c)
    if p <> invalid then
        now = NowSecs()
        m.hudNow.text = "AHORA  ·  " + HhMm(p.s) + " – " + HhMm(p.e) + "  ·  quedan " + Int((p.e - now) / 60).ToStr() + " min"
        m.hudNowTitle.text = p.t
        m.hudProg.width = Int(1100 * (now - p.s) / (p.e - p.s))
    else
        m.hudNow.text = "Sin información de guía"
        m.hudNowTitle.text = c.n
        m.hudProg.width = 0
    end if
    m.hudNext.text = nextText(c, 3, Chr(10)).Replace("Después:  ", "DESPUÉS" + Chr(10))
end sub

sub onWatchdog()
    s = curSrc()
    if s = invalid or s.type <> "stalker" or not livePlaying() then
        m.wd.control = "stop"
        return
    end if
    runTask({ kind: "watchdog", src: s }, "onIgnore")
end sub

sub onIgnore()
end sub

' ---------- estado del video (en vivo y películas) ----------

sub onVideoState()
    st = m.video.state
    if m.vodMode then
        onVodState(st)
        return
    end if
    if not m.video.visible or m.playList = invalid then return
    c = m.playList[m.playIndex]
    if st = "playing" then
        m.retries = 0
        hideMsg()
        m.playStarted = true
    else if st = "buffering" and m.playStarted then
        showMsg(c.n + " · cargando…", false)
    else if st = "error" or st = "finished" then
        ' En vivo no hay "fin": si se corta, reconectar (hasta 3 veces seguidas).
        if m.retries < 3 then
            m.retries = m.retries + 1
            showMsg(c.n + " · reconectando (" + m.retries.ToStr() + "/3)…", false)
            startLive()
        else
            msg = "No se pudo abrir el canal."
            if st = "error" then msg = msg + " (" + m.video.errorCode.ToStr() + ")"
            if curSrc().type = "xtream" and Sv(curSrc().fmt) <> "m3u8" then msg = msg + " Prueba el formato M3U8 en Ajustes."
            showMsg(msg, false)
        end if
    end if
end sub

' ---------- Películas y Series ----------

function vodSrc() as dynamic
    s = curSrc()
    if s <> invalid and s.type = "xtream" then return s
    for each x in m.sources
        if x.type = "xtream" then return x
    end for
    return invalid
end function

sub showVod(kind as string)
    m.vod = kind
    setLeftWide(false)
    m.vodRight.visible = true
    if kind = "movie" then m.title.text = "Películas" else m.title.text = "Series"
    s = vodSrc()
    m.grid.content = CreateObject("roSGNode", "ContentNode")
    m.gridItems = []
    m.listMode = "cats"
    if s = invalid then
        m.subtitle.text = ""
        m.listHead.text = ""
        m.list.content = makeRows([])
        m.gridMsg.text = "Por ahora Películas y Series funcionan con fuentes Xtream. Agrega una en Ajustes."
        return
    end if
    m.subtitle.text = s.name
    key = kind + "|" + s.id
    m.listHead.text = "Categorías"
    if m.vodCats <> invalid and m.vodCatsKey = key then
        showCats()
        return
    end if
    m.list.content = makeRows([{ t: "Cargando…" }])
    m.gridMsg.text = ""
    runTask({ kind: "vodCats", src: s, vod: kind, tag: key }, "onVodCats")
end sub

sub onVodCats(ev as object)
    r = ev.getData()
    s = vodSrc()
    if s = invalid or r.tag <> m.vod + "|" + s.id or (m.section <> 1 and m.section <> 2) then return
    if not r.ok then
        m.list.content = makeRows([])
        m.gridMsg.text = r.error
        return
    end if
    m.vodCats = r.cats
    m.vodCatsKey = r.tag
    showCats()
end sub

sub showCats()
    rows = []
    m.catRows = []
    if continueItems().Count() > 0 then
        rows.push({ t: "Continuar viendo", icon: "pkg:/images/ic_play.png" })
        m.catRows.push({ k: "cont" })
    end if
    rows.push({ t: "Buscar", icon: "pkg:/images/ic_search.png" })
    m.catRows.push({ k: "search" })
    for each c in m.vodCats
        rows.push({ t: c.name })
        m.catRows.push({ k: "cat", id: c.id, name: c.name })
    end for
    m.list.content = makeRows(rows)
    m.listMode = "cats"
    m.catIdx = -1
    if m.catRows[0].k = "cont" then loadCat(0, false) else m.gridMsg.text = "Elige una categoría."
end sub

sub onCatTimer()
    i = m.list.itemFocused
    if m.listMode = "cats" and i >= 0 and i < m.catRows.Count() and m.catRows[i].k <> "search" then loadCat(i, false)
end sub

sub loadCat(i as integer, thenFocus as boolean)
    r = m.catRows[i]
    m.wantGridFocus = thenFocus
    if i = m.catIdx and m.gridItems.Count() > 0 then
        if thenFocus then focusGrid()
        return
    end if
    m.catIdx = i
    if r.k = "cont" then
        showGrid(continueItems(), "")
        return
    end if
    if r.k = "search" then
        askSearch()
        return
    end if
    s = vodSrc()
    key = m.vod + "|" + s.id + "|" + r.id
    if m.vodCache.DoesExist(key) then
        showGrid(m.vodCache[key], "")
        return
    end if
    m.grid.content = CreateObject("roSGNode", "ContentNode")
    m.gridItems = []
    m.gridMsg.text = "Cargando " + r.name + "…"
    runTask({ kind: "vodList", src: s, vod: m.vod, cat: r.id, tag: key }, "onVodList")
end sub

sub onVodList(ev as object)
    r = ev.getData()
    if not r.ok then
        m.gridMsg.text = r.error
        return
    end if
    m.vodCache[r.tag] = r.items
    m.vodCacheOrder.push(r.tag)
    if m.vodCacheOrder.Count() > 4 then m.vodCache.Delete(m.vodCacheOrder.Shift())
    s = vodSrc()
    if s = invalid or m.catIdx < 0 or m.catIdx >= m.catRows.Count() then return
    cr = m.catRows[m.catIdx]
    if cr.k = "cat" and r.tag = m.vod + "|" + s.id + "|" + cr.id then showGrid(r.items, "")
end sub

sub askSearch()
    d = CreateObject("roSGNode", "StandardKeyboardDialog")
    if m.vod = "movie" then d.title = "Buscar películas" else d.title = "Buscar series"
    d.buttons = ["Buscar", "Cancelar"]
    d.observeField("buttonSelected", "onSearchKeyboard")
    m.dialog = d
    m.top.dialog = d
end sub

sub onSearchKeyboard()
    d = m.dialog
    q = d.text.Trim()
    ok = d.buttonSelected = 0
    d.close = true
    if not ok or q = "" then
        m.catIdx = -1
        focusList()
        return
    end if
    m.gridMsg.text = "Buscando «" + q + "»… la primera búsqueda tarda un poco."
    m.grid.content = CreateObject("roSGNode", "ContentNode")
    m.gridItems = []
    m.wantGridFocus = true
    runTask({ kind: "vodSearch", src: vodSrc(), vod: m.vod, q: q, tag: m.vod + "|" + q }, "onVodSearch")
end sub

sub onVodSearch(ev as object)
    r = ev.getData()
    if not r.ok then
        m.gridMsg.text = r.error
        return
    end if
    if (m.section = 1 and m.vod = "movie") or (m.section = 2 and m.vod = "series") then
        if r.items.Count() = 0 then
            m.gridMsg.text = "Sin resultados."
            focusList()
        else
            showGrid(r.items, "")
        end if
    end if
end sub

sub showGrid(items as object, emptyMsg as string)
    m.gridItems = items
    c = CreateObject("roSGNode", "ContentNode")
    for each it in items
        n = c.createChild("ContentNode")
        n.title = it.n
        n.HDPosterUrl = it.i
        p = 0.0
        sub1 = Sv(it.sub)
        e = progGet(vodKind(), it.id)
        if m.vod = "movie" and e <> invalid then
            if e.w then p = 1.0 else if e.d > 0 then p = e.p / e.d
        end if
        if it.prog <> invalid then p = it.prog
        n.addFields({ sub: sub1, prog: p })
    end for
    m.grid.content = c
    if items.Count() = 0 then
        if emptyMsg = "" then emptyMsg = "No hay títulos aquí."
        m.gridMsg.text = emptyMsg
    else
        m.gridMsg.text = ""
        if m.wantGridFocus then focusGrid()
    end if
    m.wantGridFocus = false
end sub

sub focusGrid()
    if m.gridItems = invalid or m.gridItems.Count() = 0 then return
    m.focus = "grid"
    m.grid.setFocus(true)
end sub

function vodKind() as string
    if m.vod = "movie" then return "m"
    return "s"
end function

' ---------- progreso ("Continuar viendo"), guardado en el registro ----------

function progAll() as object
    if m.prog = invalid then
        m.prog = {}
        if m.reg.Exists("vp") then
            v = ParseJson(m.reg.Read("vp"))
            if type(v) = "roAssociativeArray" then m.prog = v
        end if
    end if
    return m.prog
end function

function progKey(kind as string, id as string) as string
    s = vodSrc()
    sid = ""
    if s <> invalid then sid = s.id
    return kind + "_" + sid + "_" + id
end function

function progGet(kind as string, id as string) as dynamic
    return progAll()[progKey(kind, id)]
end function

function isDone(ps as integer, dur as integer) as boolean
    if dur <= 0 then return false
    if ps >= dur * 0.95 then return true
    return dur > 600 and dur - ps < 120
end function

sub progPut(e as object, ps as integer, dur as integer, watched as boolean)
    all = progAll()
    rec = { k: e.k, id: e.id, x: Sv(e.x), n: Left(Sv(e.n), 48), i: Sv(e.i), p: ps, d: dur, w: watched, at: NowSecs(), s: vodSrc().id }
    if e.k = "e" then
        rec.sr = e.sr
        rec.sn = Left(Sv(e.sn), 48)
        rec.se = e.se
        rec.ep = e.ep
    end if
    all[progKey(e.k, e.id)] = rec
    if all.Count() > 30 then
        arr = []
        for each k in all
            arr.push({ k: k, at: all[k].at })
        end for
        arr.SortBy("at")
        while arr.Count() > 30
            all.Delete(arr.Shift().k)
        end while
    end if
    m.reg.Write("vp", FormatJson(all))
    m.reg.Flush()
end sub

sub progForget(kind as string, id as string)
    all = progAll()
    all.Delete(progKey(kind, id))
    m.reg.Write("vp", FormatJson(all))
    m.reg.Flush()
end sub

function continueItems() as object
    s = vodSrc()
    if s = invalid then return []
    arr = []
    all = progAll()
    if m.vod = "movie" then
        for each k in all
            e = all[k]
            if e.k = "m" and e.s = s.id and not e.w and e.p > 30 then
                p = 0.0
                if e.d > 0 then p = e.p / e.d
                arr.push({ id: e.id, n: e.n, i: e.i, x: e.x, at: e.at, prog: p, sub: "quedan " + HumanMin(e.d - e.p) })
            end if
        end for
    else
        latest = {}
        for each k in all
            e = all[k]
            if e.k = "e" and e.s = s.id then
                if latest[e.sr] = invalid or latest[e.sr].at < e.at then latest[e.sr] = e
            end if
        end for
        for each sr in latest
            e = latest[sr]
            p = 0.0
            if e.d > 0 then p = e.p / e.d
            if e.w then p = 0.0
            arr.push({ id: e.sr, n: e.sn, i: e.i, at: e.at, prog: p, sub: "T" + e.se.ToStr() + " · E" + e.ep.ToStr() })
        end for
    end if
    arr.SortBy("at", "r")
    return arr
end function

' ---------- ficha ----------

sub onGridSelect()
    i = m.grid.itemSelected
    if i < 0 or i >= m.gridItems.Count() then return
    openDetail(m.gridItems[i])
end sub

sub openDetail(it as object)
    m.dItem = it
    m.dInfo = invalid
    m.seasons = invalid
    m.detail.visible = true
    m.vodRight.visible = false
    m.dTitle.text = it.n
    m.dCover.uri = it.i
    m.dMeta.text = ""
    m.dPlot.text = "Cargando ficha…"
    m.dCast.text = ""
    m.dSeasons.visible = false
    m.dSeasons.content = makeRows([])
    if m.vod = "movie" then
        m.dList.translation = [648, 612]
        m.dList.itemSize = [620, 76]
        m.dList.numRows = 4
        renderMovieActions()
        runTask({ kind: "movieInfo", src: vodSrc(), id: it.id, tag: it.id }, "onMovieInfo")
    else
        m.dList.translation = [648, 612]
        m.dList.itemSize = [1212, 72]
        m.dList.numRows = 5
        m.dList.content = makeRows([{ t: "Cargando episodios…" }])
        m.dActs = []
        runTask({ kind: "seriesInfo", src: vodSrc(), id: it.id, tag: it.id }, "onSeriesInfo")
    end if
    m.focus = "detail"
    m.dList.setFocus(true)
end sub

sub closeDetail()
    m.detail.visible = false
    m.vodRight.visible = true
    ' refrescar portadas (progreso) y "Continuar viendo"
    if m.catIdx >= 0 and m.catIdx < m.catRows.Count() and m.catRows[m.catIdx].k = "cont" then
        showGrid(continueItems(), "Ya no hay nada pendiente.")
    else if m.gridItems <> invalid then
        f = m.grid.itemFocused
        showGrid(m.gridItems, "")
        m.grid.jumpToItem = f
    end if
    if m.gridItems <> invalid and m.gridItems.Count() > 0 then focusGrid() else focusList()
end sub

function joinParts(parts as object) as string
    out = ""
    for each p in parts
        if p <> invalid and p <> "" and p <> "0" then
            if out <> "" then out = out + "  ·  "
            out = out + p
        end if
    end for
    return out
end function

function ratingText(r as string) as string
    if r = "" or r = "0" then return ""
    return "Calificación " + Left(r, 3)
end function

sub onMovieInfo(ev as object)
    r = ev.getData()
    if not m.detail.visible or m.dItem = invalid or r.tag <> m.dItem.id then return
    if not r.ok then
        m.dPlot.text = r.error
        return
    end if
    i = r.info
    m.dInfo = i
    if i.n <> "" then m.dTitle.text = i.n
    if i.cover <> "" then m.dCover.uri = i.cover
    m.dMeta.text = joinParts([i.year, HumanMin(i.dur), ratingText(i.rating), i.genre])
    m.dPlot.text = i.plot
    cast = ""
    if i.director <> "" then cast = "Dirección: " + i.director
    if i.cast <> "" then
        if cast <> "" then cast = cast + "   "
        cast = cast + "Reparto: " + i.cast
    end if
    m.dCast.text = cast
    if Sv(m.dItem.x) = "" then m.dItem.x = i.x
    renderMovieActions()
end sub

sub renderMovieActions()
    e = progGet("m", m.dItem.id)
    rows = []
    m.dActs = []
    if e <> invalid and not e.w and e.p > 30 then
        rows.push({ t: "Continuar desde " + Clock(e.p), right: "de " + Clock(e.d), icon: "pkg:/images/ic_play.png" })
        m.dActs.push("resume")
        rows.push({ t: "Ver desde el inicio" })
        m.dActs.push("start")
    else
        rows.push({ t: "Reproducir", icon: "pkg:/images/ic_play.png" })
        m.dActs.push("start")
    end if
    if e <> invalid and e.w then
        rows.push({ t: "Marcar como no vista", icon: "pkg:/images/ic_check.png" })
    else
        rows.push({ t: "Marcar como vista" })
    end if
    m.dActs.push("toggle")
    m.dList.content = makeRows(rows)
end sub

function movieEntry() as object
    it = m.dItem
    x = Sv(it.x)
    if x = "" then x = "mp4"
    n = it.n
    if m.dInfo <> invalid and m.dInfo.n <> "" then n = m.dInfo.n
    cover = it.i
    if m.dInfo <> invalid and m.dInfo.cover <> "" then cover = m.dInfo.cover
    return { k: "m", id: it.id, x: x, n: n, i: cover }
end function

sub onSeriesInfo(ev as object)
    r = ev.getData()
    if not m.detail.visible or m.dItem = invalid or r.tag <> m.dItem.id then return
    if not r.ok then
        m.dPlot.text = r.error
        m.dList.content = makeRows([])
        return
    end if
    i = r.info
    m.dInfo = i
    if i.n <> "" then m.dTitle.text = i.n
    if i.cover <> "" then m.dCover.uri = i.cover
    ns = r.seasons.Count()
    tem = ns.ToStr() + " temporadas"
    if ns = 1 then tem = "1 temporada"
    m.dMeta.text = joinParts([i.year, tem, ratingText(i.rating), i.genre])
    m.dPlot.text = i.plot
    if i.cast <> "" then m.dCast.text = "Reparto: " + i.cast
    m.seasons = r.seasons
    if ns = 0 then
        m.dList.content = makeRows([{ t: "Esta serie no tiene episodios." }])
        return
    end if
    rows = []
    for each s in m.seasons
        rows.push({ t: "Temporada " + s.n.ToStr(), right: s.eps.Count().ToStr() + " ep." })
    end for
    m.dSeasons.content = makeRows(rows)
    m.dSeasons.visible = true
    ' Empezar en la temporada del último episodio visto.
    m.seasonIdx = 0
    last = lastEpisode()
    if last <> invalid then
        for k = 0 to m.seasons.Count() - 1
            if m.seasons[k].n = last.se then m.seasonIdx = k
        end for
    end if
    m.dSeasons.jumpToItem = m.seasonIdx
    renderEpisodes()
end sub

function lastEpisode() as dynamic
    best = invalid
    all = progAll()
    s = vodSrc()
    for each k in all
        e = all[k]
        if e.k = "e" and e.s = s.id and e.sr = m.dItem.id then
            if best = invalid or best.at < e.at then best = e
        end if
    end for
    return best
end function

function epEntry(si as integer, ei as integer) as object
    s = m.seasons[si]
    ep = s.eps[ei]
    x = ep.x
    if x = "" then x = "mp4"
    name = m.dItem.n
    cover = m.dItem.i
    if m.dInfo <> invalid then
        if m.dInfo.n <> "" then name = m.dInfo.n
        if m.dInfo.cover <> "" then cover = m.dInfo.cover
    end if
    return { k: "e", id: ep.id, x: x, n: ep.t, i: cover, sr: m.dItem.id, sn: name, se: s.n, ep: ep.n, d: ep.d, si: si, ei: ei }
end function

' Siguiente episodio a ver: el último a medias, o el que sigue al último terminado.
function continueTarget() as dynamic
    last = lastEpisode()
    if last = invalid then return { si: 0, ei: 0, label: "Ver T" + m.seasons[0].n.ToStr() + " · E" + m.seasons[0].eps[0].n.ToStr() }
    for si = 0 to m.seasons.Count() - 1
        eps = m.seasons[si].eps
        for ei = 0 to eps.Count() - 1
            if eps[ei].id = last.id then
                if not last.w then return { si: si, ei: ei, label: "Continuar T" + m.seasons[si].n.ToStr() + " · E" + eps[ei].n.ToStr() + "  (" + Clock(last.p) + ")" }
                nx = nextEp(si, ei)
                if nx = invalid then return invalid
                return { si: nx.si, ei: nx.ei, label: "Siguiente: T" + m.seasons[nx.si].n.ToStr() + " · E" + m.seasons[nx.si].eps[nx.ei].n.ToStr() }
            end if
        end for
    end for
    return invalid
end function

function nextEp(si as integer, ei as integer) as dynamic
    if ei + 1 < m.seasons[si].eps.Count() then return { si: si, ei: ei + 1 }
    if si + 1 < m.seasons.Count() and m.seasons[si + 1].eps.Count() > 0 then return { si: si + 1, ei: 0 }
    return invalid
end function

sub onSeasonFocus()
    if m.seasons = invalid then return
    i = m.dSeasons.itemFocused
    if i < 0 or i = m.seasonIdx then return
    m.seasonIdx = i
    renderEpisodes()
end sub

sub renderEpisodes()
    rows = []
    m.dActs = []
    t = continueTarget()
    if t <> invalid then
        ep = m.seasons[t.si].eps[t.ei]
        rows.push({ t: t.label, sub: ep.t, icon: "pkg:/images/ic_play.png" })
        m.dActs.push({ si: t.si, ei: t.ei })
    end if
    s = m.seasons[m.seasonIdx]
    for ei = 0 to s.eps.Count() - 1
        ep = s.eps[ei]
        e = progGet("e", ep.id)
        rt = HumanMin(ep.d)
        icon = ""
        if e <> invalid then
            if e.w then
                rt = "Visto"
                icon = "pkg:/images/ic_check.png"
            else if e.p > 30 then
                rt = Clock(e.p) + " de " + Clock(e.d)
            end if
        end if
        title = "E" + ep.n.ToStr()
        if ep.t <> "" then title = title + "  ·  " + ep.t
        rows.push({ t: title, right: rt, icon: icon })
        m.dActs.push({ si: m.seasonIdx, ei: ei })
    end for
    f = m.dList.itemFocused
    m.dList.content = makeRows(rows)
    if f > 0 and f < rows.Count() then m.dList.jumpToItem = f
end sub

sub onDListSelect()
    i = m.dList.itemSelected
    if m.dActs = invalid or i < 0 or i >= m.dActs.Count() then return
    if m.vod = "movie" then
        a = m.dActs[i]
        e = progGet("m", m.dItem.id)
        if a = "resume" and e <> invalid then
            playVod(movieEntry(), e.p)
        else if a = "start" then
            playVod(movieEntry(), 0)
        else if a = "toggle" then
            if e <> invalid and e.w then progForget("m", m.dItem.id) else progPut(movieEntry(), 0, 0, true)
            renderMovieActions()
        end if
        return
    end if
    a = m.dActs[i]
    en = epEntry(a.si, a.ei)
    e = progGet("e", en.id)
    start = 0
    if e <> invalid and not e.w and e.p > 30 then start = e.p
    playVod(en, start)
end sub

sub toggleEpisodeWatched()
    i = m.dList.itemFocused
    if m.seasons = invalid or i < 0 or i >= m.dActs.Count() then return
    a = m.dActs[i]
    en = epEntry(a.si, a.ei)
    e = progGet("e", en.id)
    if e <> invalid and e.w then progForget("e", en.id) else progPut(en, 0, 0, true)
    renderEpisodes()
end sub

' ---------- reproducir película o episodio ----------

sub playVod(e as object, startAt as integer)
    s = vodSrc()
    path = "/movie/"
    if e.k = "e" then path = "/series/"
    url = XtreamBase(s.server) + path + Esc(s.user) + "/" + Esc(s.pass) + "/" + e.id + "." + e.x
    content = CreateObject("roSGNode", "ContentNode")
    content.url = url
    title = e.n
    if e.k = "e" then title = e.sn + "  ·  T" + e.se.ToStr() + " E" + e.ep.ToStr()
    content.title = title
    content.live = false
    content.streamFormat = FormatFor(url, "")
    if startAt > 0 then content.PlayStart = startAt
    m.vodMode = true
    m.vodEntry = e
    m.vodPos = startAt
    m.vodLastSave = startAt
    m.video.enableUI = true
    videoFull()
    m.video.visible = true
    m.video.content = content
    m.video.control = "play"
    m.focus = "video"
    m.video.setFocus(true)
    showMsg(title + " · cargando…", false)
end sub

sub onVideoPos()
    if not m.vodMode then return
    ps = Int(m.video.position)
    if ps <= 0 then return
    m.vodPos = ps
    if Abs(ps - m.vodLastSave) >= 20 then saveVod(false)
end sub

sub saveVod(force as boolean)
    if not m.vodMode or m.vodEntry = invalid then return
    dur = Int(m.video.duration)
    if dur <= 0 and m.vodEntry.d <> invalid then dur = m.vodEntry.d
    if m.vodPos < 10 and not force then return
    m.vodLastSave = m.vodPos
    progPut(m.vodEntry, m.vodPos, dur, isDone(m.vodPos, dur))
end sub

sub onVodState(st as string)
    if st = "playing" then
        hideMsg()
    else if st = "finished" then
        dur = Int(m.video.duration)
        if dur > 0 then m.vodPos = dur
        saveVod(true)
        e = m.vodEntry
        if e.k = "e" and m.seasons <> invalid and e.si <> invalid then
            nx = nextEp(e.si, e.ei)
            if nx <> invalid then
                en = epEntry(nx.si, nx.ei)
                showMsg("Siguiente: T" + en.se.ToStr() + " · E" + en.ep.ToStr(), true)
                playVod(en, 0)
                return
            end if
        end if
        closeVod()
    else if st = "error" then
        showMsg("No se pudo reproducir (" + m.video.errorCode.ToStr() + "). Atrás = volver.", false)
    end if
end sub

sub closeVod()
    if m.vodMode and m.vodPos > 10 then saveVod(true)
    m.vodMode = false
    m.video.control = "stop"
    m.video.visible = false
    m.video.enableUI = false
    videoPreview()
    hideMsg()
    closeTracks(false)
    if m.detail.visible then
        if m.vod = "movie" then
            renderMovieActions()
        else if m.seasons <> invalid then
            if m.vodEntry <> invalid and m.vodEntry.si <> invalid and m.vodEntry.si <> m.seasonIdx then
                m.seasonIdx = m.vodEntry.si
                m.dSeasons.jumpToItem = m.seasonIdx
            end if
            renderEpisodes()
        end if
        m.focus = "detail"
        m.dList.setFocus(true)
    else
        focusList()
    end if
end sub

' ---------- audio y subtítulos ----------

function langName(code as string) as string
    c = LCase(code)
    names = { spa: "Español", es: "Español", esp: "Español", eng: "Inglés", en: "Inglés", por: "Portugués", pt: "Portugués", fre: "Francés", fra: "Francés", fr: "Francés", ger: "Alemán", deu: "Alemán", de: "Alemán", ita: "Italiano", it: "Italiano", jpn: "Japonés", ja: "Japonés", kor: "Coreano", ko: "Coreano", chi: "Chino", zho: "Chino", zh: "Chino", rus: "Ruso", ru: "Ruso", lat: "Latino" }
    if names.DoesExist(c) then return names[c]
    if code = "" then return "Desconocido"
    return UCase(code)
end function

sub openTracks()
    rows = []
    m.trackActs = []
    audio = m.video.availableAudioTracks
    if type(audio) = "roArray" then
        for each a in audio
            label = langName(Sv(a.Language))
            if Sv(a.Name) <> "" and LCase(Sv(a.Name)) <> LCase(Sv(a.Language)) then label = label + "  ·  " + Sv(a.Name)
            icon = ""
            if Sv(a.Track) = Sv(m.video.currentAudioTrack) then icon = "pkg:/images/ic_check.png"
            rows.push({ t: label, sub: "Audio", icon: icon })
            m.trackActs.push({ k: "a", v: Sv(a.Track) })
        end for
    end if
    subsOn = m.video.globalCaptionMode = "On"
    icon = ""
    if not subsOn then icon = "pkg:/images/ic_check.png"
    rows.push({ t: "Sin subtítulos", sub: "Subtítulos", icon: icon })
    m.trackActs.push({ k: "off" })
    subs = m.video.availableSubtitleTracks
    if type(subs) = "roArray" then
        for each t in subs
            label = langName(Sv(t.Language))
            if Sv(t.Description) <> "" then label = label + "  ·  " + Sv(t.Description)
            icon = ""
            if subsOn and Sv(t.TrackName) = Sv(m.video.currentSubtitleTrack) then icon = "pkg:/images/ic_check.png"
            rows.push({ t: label, sub: "Subtítulos", icon: icon })
            m.trackActs.push({ k: "s", v: Sv(t.TrackName) })
        end for
    end if
    m.tList.content = makeRows(rows)
    m.tracks.visible = true
    m.focus = "tracks"
    m.tList.setFocus(true)
end sub

sub onTrackSelect()
    i = m.tList.itemSelected
    if i < 0 or i >= m.trackActs.Count() then return
    a = m.trackActs[i]
    if a.k = "a" then
        m.video.audioTrack = a.v
    else if a.k = "off" then
        m.video.globalCaptionMode = "Off"
    else
        m.video.subtitleTrack = a.v
        m.video.globalCaptionMode = "On"
    end if
    closeTracks(true)
end sub

sub closeTracks(refocus as boolean)
    if not m.tracks.visible then return
    m.tracks.visible = false
    if refocus and m.video.visible then
        m.focus = "video"
        m.video.setFocus(true)
    end if
end sub

' ---------- Ajustes ----------

sub showSettings()
    setLeftWide(true)
    m.setRight.visible = true
    m.title.text = "Ajustes"
    m.subtitle.text = "Fuentes · se guardan solo en este Roku"
    m.listHead.text = "Fuentes"
    rows = []
    for i = 0 to m.sources.Count() - 1
        s = m.sources[i]
        sub1 = UCase(s.type)
        if s.type = "xtream" then sub1 = sub1 + "  ·  " + UCase(defaultStr(s.fmt, "ts"))
        icon = ""
        rt = ""
        if i = m.srcIndex then
            icon = "pkg:/images/ic_check.png"
            rt = "En uso"
        end if
        rows.push({ t: s.name, sub: sub1, icon: icon, right: rt })
    end for
    rows.push({ t: "Agregar Xtream con el control", sub: "Mejor desde el celular (a la derecha)" })
    rows.push({ t: "Agregar lista M3U con el control", sub: "Mejor desde el celular (a la derecha)" })
    rows.push({ t: "Agregar portal Stalker con el control", sub: "Mejor desde el celular (a la derecha)" })
    m.list.content = makeRows(rows)
    m.listMode = "settings"
    ip = FirstIp()
    if m.web.status = "error" or ip = "" then
        m.setSteps.text = "No se pudo abrir la página para el celular en este Roku. Usa el control o la app Roku del celular como teclado."
        m.setUrl.text = ""
        m.setPin.text = ""
    else
        m.setSteps.text = "1. Conecta el celular a la misma red Wi-Fi que el Roku." + Chr(10) + "2. Abre esta dirección en el navegador del celular." + Chr(10) + "3. Escribe el PIN y tus datos. Aparecen aquí al instante."
        m.setUrl.text = "http://" + ip + ":8888"
        m.setPin.text = "PIN  " + m.pin
    end if
    m.setInfo.text = "Elige una fuente a la izquierda para usarla, cambiar su formato, actualizar sus canales o borrarla." + Chr(10) + Chr(10) + "T-Max no tiene servidores ni cuentas: el Roku habla directo con tus fuentes." + Chr(10) + Chr(10) + "T-Max 0.2.0 para Roku · GPL-3.0"
end sub

function defaultStr(v as dynamic, d as string) as string
    if v = invalid or v = "" then return d
    return v
end function

sub onWebChanged()
    m.sources = LoadSources()
    m.srcIndex = 0
    if m.reg.Exists("srcIndex") then m.srcIndex = m.reg.Read("srcIndex").ToInt()
    if m.srcIndex >= m.sources.Count() then m.srcIndex = 0
    m.groups = invalid
    m.channels = invalid
    m.liveMode = "groups"
    m.vodCats = invalid
    if m.section = 0 then
        stopLive()
        showLive()
    else if m.section = 3 and m.listMode = "settings" then
        f = m.list.itemFocused
        showSettings()
        m.list.jumpToItem = f
    end if
    showMsg("Fuente agregada desde el celular.", true)
end sub

sub settingsPick(i as integer)
    n = m.sources.Count()
    if i < n then
        m.editIndex = i
        m.confirmDel = false
        showSourceActions()
        return
    end if
    k = i - n
    if k = 0 then
        askFields("xtream", [
            { key: "name", title: "Nombre", hint: "Ej. Mi servidor" },
            { key: "server", title: "Servidor Xtream", hint: "http://servidor:puerto" },
            { key: "user", title: "Usuario", hint: "" },
            { key: "pass", title: "Contraseña", hint: "Se guarda solo en este Roku", secure: true }
        ])
    else if k = 1 then
        askFields("m3u", [
            { key: "name", title: "Nombre", hint: "Ej. Mi lista" },
            { key: "url", title: "URL de la lista M3U", hint: "https://…/lista.m3u" }
        ])
    else
        askFields("stalker", [
            { key: "name", title: "Nombre", hint: "Ej. Mi portal" },
            { key: "server", title: "URL del portal", hint: "http://portal/stalker_portal/c/" },
            { key: "mac", title: "MAC", hint: "00:1A:79:XX:XX:XX" }
        ])
    end if
end sub

sub showSourceActions()
    s = m.sources[m.editIndex]
    rows = []
    m.srcActs = []
    rows.push({ t: "Usar esta fuente", icon: "pkg:/images/ic_check.png" })
    m.srcActs.push("use")
    if s.type = "xtream" then
        if defaultStr(s.fmt, "ts") = "ts" then rows.push({ t: "Formato: TS", sub: "Cambiar a M3U8 / HLS" }) else rows.push({ t: "Formato: M3U8", sub: "Cambiar a TS" })
        m.srcActs.push("fmt")
    end if
    rows.push({ t: "Actualizar canales", sub: "Vuelve a descargar grupos y canales" })
    m.srcActs.push("refresh")
    if m.confirmDel then rows.push({ t: "¿Seguro? OK otra vez para borrar" }) else rows.push({ t: "Borrar esta fuente" })
    m.srcActs.push("del")
    rows.push({ t: "Volver" })
    m.srcActs.push("back")
    m.list.content = makeRows(rows)
    m.listMode = "srcActions"
    m.listHead.text = s.name
end sub

sub srcAction(i as integer)
    s = m.sources[m.editIndex]
    a = m.srcActs[i]
    if a = "fmt" then
        if defaultStr(s.fmt, "ts") = "ts" then s.fmt = "m3u8" else s.fmt = "ts"
        m.sources[m.editIndex] = s
        SaveSources(m.sources)
        showSourceActions()
        m.list.jumpToItem = i
        return
    else if a = "use" then
        m.srcIndex = m.editIndex
        m.reg.Write("srcIndex", m.srcIndex.ToStr())
        m.reg.Flush()
        m.groups = invalid
        m.channels = invalid
        m.liveMode = "groups"
        m.vodCats = invalid
    else if a = "refresh" then
        if m.editIndex = m.srcIndex then
            m.groups = invalid
            m.channels = invalid
            m.liveMode = "groups"
        end if
        m.vodCats = invalid
        m.vodCache = {}
        m.vodCacheOrder = []
        m.epg = {}
        CreateObject("roFileSystem").Delete("cachefs:/s_" + s.id + "_movie.json")
        CreateObject("roFileSystem").Delete("cachefs:/s_" + s.id + "_series.json")
        showMsg("Se actualizará al abrir TV en vivo.", true)
    else if a = "del" then
        if not m.confirmDel then
            m.confirmDel = true
            showSourceActions()
            m.list.jumpToItem = i
            return
        end if
        m.sources.Delete(m.editIndex)
        SaveSources(m.sources)
        if m.srcIndex >= m.sources.Count() then m.srcIndex = 0
        m.reg.Write("srcIndex", m.srcIndex.ToStr())
        m.reg.Flush()
        m.groups = invalid
        m.channels = invalid
        m.liveMode = "groups"
        m.vodCats = invalid
    end if
    showSettings()
    m.list.jumpToItem = m.editIndex
end sub

sub askFields(kind as string, fields as object)
    m.newSrc = { type: kind, id: CreateObject("roDeviceInfo").GetRandomUUID().Left(8), fmt: "ts" }
    m.askQueue = fields
    askNext()
end sub

sub askNext()
    if m.askQueue.Count() = 0 then
        if m.newSrc.name = invalid or m.newSrc.name = "" then m.newSrc.name = UCase(m.newSrc.type)
        m.sources.push(m.newSrc)
        SaveSources(m.sources)
        m.srcIndex = m.sources.Count() - 1
        m.reg.Write("srcIndex", m.srcIndex.ToStr())
        m.reg.Flush()
        m.groups = invalid
        m.channels = invalid
        m.liveMode = "groups"
        m.vodCats = invalid
        showSettings()
        focusList()
        showMsg("Fuente guardada.", true)
        return
    end if
    f = m.askQueue[0]
    d = CreateObject("roSGNode", "StandardKeyboardDialog")
    d.title = f.title
    if f.hint <> "" then d.message = [f.hint]
    d.buttons = ["Aceptar", "Cancelar"]
    if f.secure = true then d.textEditBox.secureMode = true
    d.observeField("buttonSelected", "onKeyboard")
    m.dialog = d
    m.top.dialog = d
end sub

sub onKeyboard()
    d = m.dialog
    if d.buttonSelected = 0 then
        f = m.askQueue.Shift()
        m.newSrc[f.key] = d.text.Trim()
        d.close = true
        askNext()
    else
        d.close = true
        m.askQueue = []
        focusList()
    end if
end sub

' ---------- lista y control remoto ----------

sub onListSelect()
    i = m.list.itemSelected
    if m.section = 0 then
        if m.liveMode = "groups" and m.groups <> invalid then
            openGroup(i)
        else if m.liveMode = "channels" and m.channels <> invalid and i < m.channels.Count() then
            if livePlaying() and chKey(m.playList[m.playIndex]) = chKey(m.channels[i]) then
                goFull()
            else
                preview(i)
            end if
        end if
    else if m.section = 1 or m.section = 2 then
        if m.listMode = "cats" and m.catRows <> invalid and i < m.catRows.Count() then
            if m.catRows[i].k = "search" then
                m.catIdx = i
                askSearch()
            else
                loadCat(i, true)
            end if
        end if
    else if m.listMode = "settings" then
        settingsPick(i)
    else if m.listMode = "srcActions" then
        srcAction(i)
    end if
end sub

function onKeyEvent(key as string, press as boolean) as boolean
    if not press then return false
    f = m.focus
    if f = "tracks" then
        if key = "back" or key = "left" or key = "options" then
            closeTracks(true)
            return true
        end if
        return false
    end if
    if f = "video" then
        if m.vodMode then
            if key = "back" then
                closeVod()
                return true
            else if key = "options" or key = "up" then
                openTracks()
                return true
            end if
            return false
        end if
        if key = "back" then
            exitFull()
        else if key = "up" then
            zap(-1)
        else if key = "down" then
            zap(1)
        else if key = "OK" or key = "info" or key = "left" or key = "right" then
            showHud()
        else if key = "options" then
            openTracks()
        else
            return false
        end if
        return true
    end if
    if f = "detail" or f = "seasons" then
        if key = "back" then
            closeDetail()
            return true
        end if
        if m.vod = "series" and m.seasons <> invalid then
            if f = "detail" and key = "left" then
                m.focus = "seasons"
                m.dSeasons.setFocus(true)
                return true
            else if f = "seasons" and (key = "right" or key = "OK") then
                m.focus = "detail"
                m.dList.setFocus(true)
                return true
            else if f = "detail" and key = "options" then
                toggleEpisodeWatched()
                return true
            end if
        end if
        return false
    end if
    if f = "grid" then
        if key = "back" or key = "left" then
            focusList()
            return true
        end if
        return false
    end if
    if f = "list" then
        if key = "back" then
            if m.section = 0 and m.liveMode = "channels" then
                showGroups()
            else if m.section = 3 and m.listMode = "srcActions" then
                showSettings()
                m.list.jumpToItem = m.editIndex
            else
                focusRail()
            end if
            return true
        else if key = "left" then
            focusRail()
            return true
        else if key = "right" then
            if (m.section = 1 or m.section = 2) and m.gridItems <> invalid and m.gridItems.Count() > 0 then focusGrid()
            return true
        else if key = "play" and m.section = 0 and m.liveMode = "channels" and m.channels <> invalid and m.channels.Count() > 0 then
            i = m.list.itemFocused
            if not (livePlaying() and chKey(m.playList[m.playIndex]) = chKey(m.channels[i])) then preview(i)
            goFull()
            return true
        else if key = "options" and m.section = 0 then
            if m.liveMode = "channels" and m.channels <> invalid and m.channels.Count() > 0 then
                i = m.list.itemFocused
                toggleFav(m.channels[i])
                if m.channelsKey = "fav" then
                    m.channels = favorites()
                    showChannels(i)
                else
                    m.list.content.getChild(i).icon = ""
                    if isFav(m.channels[i]) then m.list.content.getChild(i).icon = "pkg:/images/ic_star.png"
                    m.list.content.getChild(i).sub = m.list.content.getChild(i).sub
                    m.list.content.getChild(i).rt = ""
                end if
                return true
            else if m.liveMode = "groups" and m.sources.Count() > 1 then
                switchSource()
                return true
            end if
        end if
        return false
    end if
    if f = "rail" then
        if key = "right" then
            focusContent()
            return true
        end if
        if key = "options" and m.section = 0 and m.sources.Count() > 1 then
            switchSource()
            return true
        end if
    end if
    return false
end function

sub switchSource()
    stopLive()
    m.srcIndex = (m.srcIndex + 1) mod m.sources.Count()
    m.reg.Write("srcIndex", m.srcIndex.ToStr())
    m.reg.Flush()
    m.groups = invalid
    m.channels = invalid
    m.liveMode = "groups"
    m.vodCats = invalid
    showLive()
end sub
