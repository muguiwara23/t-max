' Navegación de T-Max en Roku. Vistas: rail → grupos → canales → video; Ajustes → fuentes.

sub init()
    m.rail = m.top.findNode("rail")
    m.list = m.top.findNode("list")
    m.title = m.top.findNode("title")
    m.subtitle = m.top.findNode("subtitle")
    m.info = m.top.findNode("info")
    m.video = m.top.findNode("video")
    m.hud = m.top.findNode("hud")
    m.hudText = m.top.findNode("hudText")
    m.wd = m.top.findNode("watchdog")
    m.hudTimer = m.top.findNode("hudTimer")
    m.reg = CreateObject("roRegistrySection", "tmax")
    m.sources = LoadSources()
    m.srcIndex = 0
    if m.reg.Exists("srcIndex") then m.srcIndex = m.reg.Read("srcIndex").ToInt()
    if m.srcIndex >= m.sources.Count() then m.srcIndex = 0
    m.sections = ["En vivo", "Películas", "Series", "Ajustes"]
    setList(m.rail, m.sections)
    m.rail.observeField("itemSelected", "onRail")
    m.rail.observeField("itemFocused", "onRailFocus")
    m.list.observeField("itemSelected", "onList")
    m.video.observeField("state", "onVideoState")
    m.wd.observeField("fire", "onWatchdog")
    m.hudTimer.observeField("fire", "hideHud")
    m.view = "rail"
    m.rail.setFocus(true)
    if m.sources.Count() = 0 then
        m.rail.jumpToItem = 3
        showSettings()
    else
        showLive()
    end if
end sub

sub setList(node as object, labels as object)
    c = CreateObject("roSGNode", "ContentNode")
    for each t in labels
        it = c.createChild("ContentNode")
        it.title = t
    end for
    node.content = c
end sub

function curSrc() as dynamic
    if m.sources.Count() = 0 then return invalid
    return m.sources[m.srcIndex]
end function

sub runTask(req as object, cb as string)
    t = CreateObject("roSGNode", "WorkTask")
    t.observeField("result", cb)
    t.request = req
    t.control = "run"
    m.task = t
end sub

' ---------- secciones ----------

sub onRailFocus()
    i = m.rail.itemFocused
    if m.view <> "rail" then return
    if i = 0 then showLive()
    if i = 1 or i = 2 then showSoon(m.sections[i])
    if i = 3 then showSettings()
end sub

sub onRail()
    i = m.rail.itemSelected
    if i = 0 then
        showLive()
        if m.groups <> invalid and m.groups.Count() > 0 then focusList("groups")
    else if i = 3 then
        showSettings()
        focusList("settings")
    end if
end sub

sub focusList(view as string)
    m.view = view
    m.list.setFocus(true)
end sub

sub showSoon(name as string)
    m.title.text = name
    m.subtitle.text = "Llega en la siguiente versión para Roku."
    setList(m.list, [])
    m.info.text = "Por ahora: TV en vivo con Xtream, listas M3U y portales Stalker."
end sub

' ---------- TV en vivo ----------

sub showLive()
    s = curSrc()
    m.title.text = "TV en vivo"
    if s = invalid then
        m.subtitle.text = "Sin fuentes"
        setList(m.list, [])
        m.info.text = "Agrega tu primera fuente en Ajustes (Xtream, lista M3U o portal Stalker)." + Chr(10) + Chr(10) + "Consejo: el teclado de la app Roku del celular es más cómodo para escribir."
        return
    end if
    m.subtitle.text = s.name + "  ·  botón * = cambiar de fuente"
    if m.groupsFor = s.id and m.groups <> invalid then
        showGroups()
        return
    end if
    m.groups = invalid
    setList(m.list, ["Cargando grupos…"])
    m.info.text = "Conectando con " + s.name + "…"
    runTask({ kind: "groups", src: s }, "onGroups")
end sub

sub onGroups()
    r = m.task.result
    if not r.ok then
        setList(m.list, [])
        m.info.text = "No se pudo cargar: " + r.error
        return
    end if
    m.groups = r.groups
    m.groupsFor = curSrc().id
    showGroups()
end sub

sub showGroups()
    labels = ["★ Favoritos"]
    for each g in m.groups
        labels.push(g.name)
    end for
    setList(m.list, labels)
    m.listMode = "groups"
    m.info.text = Str(m.groups.Count()).Trim() + " grupos." + Chr(10) + "OK = abrir · Atrás = volver."
    if m.view = "channels" then m.view = "groups"
end sub

sub openGroup(i as integer)
    if i = 0 then
        m.channels = favorites()
        m.groupName = "Favoritos"
        showChannels()
        return
    end if
    g = m.groups[i - 1]
    m.groupName = g.name
    setList(m.list, ["Cargando canales…"])
    runTask({ kind: "channels", src: curSrc(), group: g.id }, "onChannels")
end sub

sub onChannels()
    r = m.task.result
    if not r.ok then
        m.info.text = r.error
        showGroups()
        m.view = "groups"
        return
    end if
    m.channels = r.channels
    showChannels()
end sub

sub showChannels()
    labels = []
    for each c in m.channels
        num = ""
        if c.num <> invalid and c.num <> "" then num = c.num + "  "
        star = ""
        if isFav(c) then star = "  ★"
        labels.push(num + c.n + star)
    end for
    if labels.Count() = 0 then labels.push("(vacío)")
    setList(m.list, labels)
    m.listMode = "channels"
    m.view = "channels"
    m.info.text = m.groupName + " · " + Str(m.channels.Count()).Trim() + " canales" + Chr(10) + Chr(10) + "OK = ver · * = favorito · Atrás = grupos" + Chr(10) + "En el video: Arriba/Abajo = canal anterior/siguiente."
end sub

' ---------- favoritos (registro, compacto) ----------

function favKey(c as object) as string
    k = c.id
    if k = invalid or k = "" then k = c.cmd
    if k = invalid or k = "" then k = c.url
    return curSrc().id + "|" + k
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
        if f.k = k then
            found = true
        else
            out.push(f)
        end if
    end for
    if not found then
        item = { k: k, n: c.n, num: c.num, id: c.id, cmd: c.cmd, url: c.url, s: curSrc().id }
        out.push(item)
    end if
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

' ---------- reproducción ----------

sub play(i as integer)
    if m.channels = invalid or i < 0 or i >= m.channels.Count() then return
    m.playIndex = i
    m.retries = 0
    startPlayback()
end sub

sub startPlayback()
    c = m.channels[m.playIndex]
    s = curSrc()
    showHud(c.n + " · conectando…", false)
    m.video.visible = true
    m.video.setFocus(true)
    m.view = "video"
    if s.type = "stalker" then
        runTask({ kind: "link", src: s, cmd: c.cmd }, "onLink")
        return
    end if
    if s.type = "xtream" then
        ext = "ts"
        if s.fmt = "m3u8" then ext = "m3u8"
        url = XtreamBase(s.server) + "/live/" + Esc(s.user) + "/" + Esc(s.pass) + "/" + c.id + "." + ext
    else
        url = c.url
    end if
    playUrl(url, invalid)
end sub

sub onLink()
    r = m.task.result
    if not r.ok then
        showHud(r.error + Chr(10) + "Atrás = volver", false)
        return
    end if
    s = curSrc()
    playUrl(r.link, ["User-Agent: " + MagAgent(), "Cookie: " + StalkerHeaders(s, "").Cookie])
    m.wd.control = "start"
end sub

sub playUrl(url as string, headers as dynamic)
    s = curSrc()
    content = CreateObject("roSGNode", "ContentNode")
    content.url = url
    content.title = m.channels[m.playIndex].n
    content.live = true
    content.streamFormat = FormatFor(url, Txt(s.fmt))
    if headers <> invalid then content.HttpHeaders = headers
    m.playStarted = false
    m.video.content = content
    m.video.control = "play"
end sub

sub onVideoState()
    st = m.video.state
    c = m.channels[m.playIndex]
    if st = "playing" then
        m.retries = 0
        if not m.playStarted then
            m.playStarted = true
            showHud(c.num + "  " + c.n, true)
        end if
    else if st = "buffering" and m.playStarted then
        showHud(c.n + " · cargando…", false)
    else if st = "error" or st = "finished" then
        ' En vivo no hay "fin": si se corta, reconectar (hasta 3 veces seguidas).
        if m.retries < 3 then
            m.retries = m.retries + 1
            showHud(c.n + " · se cortó la señal, reconectando (" + m.retries.ToStr() + "/3)…", false)
            startPlayback()
        else
            msg = "No se pudo abrir el canal."
            if st = "error" then msg = msg + " (" + m.video.errorCode.ToStr() + ": " + m.video.errorMsg + ")"
            if curSrc().type = "xtream" and Txt(curSrc().fmt) <> "m3u8" then msg = msg + Chr(10) + "Prueba el formato M3U8 en Ajustes → la fuente."
            showHud(msg + Chr(10) + "Atrás = volver", false)
        end if
    end if
end sub

sub showHud(text as string, autoHide as boolean)
    m.hudText.text = text
    m.hud.visible = true
    m.hudText.visible = true
    m.hudTimer.control = "stop"
    if autoHide then m.hudTimer.control = "start"
end sub

sub hideHud()
    m.hud.visible = false
    m.hudText.visible = false
end sub

sub onWatchdog()
    s = curSrc()
    if s = invalid or s.type <> "stalker" or m.view <> "video" then
        m.wd.control = "stop"
        return
    end if
    w = CreateObject("roSGNode", "WorkTask")
    w.request = { kind: "watchdog", src: s }
    w.control = "run"
    m.wdTask = w
end sub

sub stopVideo()
    m.video.control = "stop"
    m.video.visible = false
    m.wd.control = "stop"
    hideHud()
    m.view = "channels"
    m.list.jumpToItem = m.playIndex
    m.list.setFocus(true)
end sub

sub zap(d as integer)
    n = m.channels.Count()
    if n = 0 then return
    m.playIndex = (m.playIndex + d + n) mod n
    m.retries = 0
    startPlayback()
end sub

' ---------- Ajustes y fuentes ----------

sub showSettings()
    m.title.text = "Ajustes"
    m.subtitle.text = "Fuentes · se guardan solo en este Roku"
    labels = []
    for each s in m.sources
        fmt = ""
        if s.type = "xtream" then fmt = "  · " + UCase(defaultStr(s.fmt, "ts"))
        labels.push(UCase(s.type) + " · " + s.name + fmt)
    end for
    labels.push("+ Agregar Xtream")
    labels.push("+ Agregar lista M3U")
    labels.push("+ Agregar portal Stalker")
    setList(m.list, labels)
    m.listMode = "settings"
    m.info.text = "Elige una fuente para cambiar su formato o borrarla." + Chr(10) + Chr(10) + "T-Max no tiene servidores ni cuentas: el Roku habla directo con tus fuentes." + Chr(10) + Chr(10) + "T-Max 0.1.0 para Roku · GPL-3.0"
end sub

function defaultStr(v as dynamic, d as string) as string
    if v = invalid or v = "" then return d
    return v
end function

sub settingsPick(i as integer)
    n = m.sources.Count()
    if i < n then
        m.editIndex = i
        s = m.sources[i]
        acts = []
        if s.type = "xtream" then
            if defaultStr(s.fmt, "ts") = "ts" then acts.push("Formato: TS (cambiar a M3U8)") else acts.push("Formato: M3U8 (cambiar a TS)")
        end if
        acts.push("Usar en TV en vivo")
        acts.push("Borrar esta fuente")
        acts.push("← Volver")
        setList(m.list, acts)
        m.listMode = "srcActions"
        m.info.text = s.name
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

sub srcAction(i as integer)
    s = m.sources[m.editIndex]
    acts = []
    if s.type = "xtream" then acts.push("fmt")
    acts.push("use")
    acts.push("del")
    acts.push("back")
    a = acts[i]
    if a = "fmt" then
        if defaultStr(s.fmt, "ts") = "ts" then s.fmt = "m3u8" else s.fmt = "ts"
        m.sources[m.editIndex] = s
        SaveSources(m.sources)
    else if a = "use" then
        m.srcIndex = m.editIndex
        m.reg.Write("srcIndex", m.srcIndex.ToStr())
        m.reg.Flush()
        m.groups = invalid
    else if a = "del" then
        m.sources.Delete(m.editIndex)
        SaveSources(m.sources)
        if m.srcIndex >= m.sources.Count() then m.srcIndex = 0
        m.groups = invalid
    end if
    showSettings()
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
        showSettings()
        m.list.setFocus(true)
        m.info.text = "Fuente guardada. Ve a TV en vivo."
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
        m.list.setFocus(true)
    end if
end sub

' ---------- lista y control remoto ----------

sub onList()
    i = m.list.itemSelected
    if m.listMode = "groups" then
        openGroup(i)
    else if m.listMode = "channels" then
        play(i)
    else if m.listMode = "settings" then
        settingsPick(i)
    else if m.listMode = "srcActions" then
        srcAction(i)
    end if
end sub

function onKeyEvent(key as string, press as boolean) as boolean
    if not press then return false
    if m.view = "video" then
        if key = "back" then
            stopVideo()
            return true
        else if key = "up" then
            zap(-1)
            return true
        else if key = "down" then
            zap(1)
            return true
        else if key = "OK" or key = "info" then
            c = m.channels[m.playIndex]
            showHud(c.num + "  " + c.n, true)
            return true
        end if
        return false
    end if
    if key = "back" then
        if m.listMode = "channels" and m.view = "channels" then
            showGroups()
            m.view = "groups"
            return true
        else if m.listMode = "srcActions" then
            showSettings()
            return true
        else if m.view <> "rail" then
            m.view = "rail"
            m.rail.setFocus(true)
            return true
        end if
        return false
    end if
    if key = "left" and m.view <> "rail" then
        m.view = "rail"
        m.rail.setFocus(true)
        return true
    end if
    if key = "right" and m.view = "rail" and m.list.content <> invalid and m.list.content.getChildCount() > 0 then
        if m.listMode = "settings" or m.listMode = "srcActions" then focusList("settings") else focusList(m.listMode)
        return true
    end if
    if key = "options" then
        if m.listMode = "channels" and m.view = "channels" then
            toggleFav(m.channels[m.list.itemFocused])
            f = m.list.itemFocused
            showChannels()
            m.list.jumpToItem = f
            return true
        else if m.sources.Count() > 1 and (m.listMode = "groups" or m.view = "rail") then
            m.srcIndex = (m.srcIndex + 1) mod m.sources.Count()
            m.reg.Write("srcIndex", m.srcIndex.ToStr())
            m.reg.Flush()
            m.groups = invalid
            showLive()
            return true
        end if
    end if
    return false
end function
