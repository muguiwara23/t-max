' Lógica del POC: configurar fuentes con el teclado del Roku, cargar listas, reproducir y anotar resultados.

sub init()
    m.reg = CreateObject("roRegistrySection", "tmaxpoc")
    m.menu = m.top.findNode("menu")
    m.list = m.top.findNode("list")
    m.logLabel = m.top.findNode("log")
    m.video = m.top.findNode("video")
    m.hud = m.top.findNode("hud")
    m.hudText = m.top.findNode("hudText")
    m.task = m.top.findNode("task")
    m.lines = []
    m.mode = "menu"
    m.items = []
    m.listKind = ""

    di = CreateObject("roDeviceInfo")
    os = di.GetOSVersion()
    m.top.findNode("device").text = di.GetModelDisplayName() + " (" + di.GetModel() + ") · Roku OS " + os.major + "." + os.minor + " · salida " + di.GetVideoMode() + " · " + di.GetGeneralMemoryLevel()

    m.menuItems = [
        "Configurar Xtream (servidor, usuario, contraseña)",
        "Configurar Stalker (portal y MAC)",
        "1. Xtream: cargar canales y probar",
        "2. Xtream: probar una película",
        "3. Stalker: cargar canales y probar",
        "Borrar resultados",
        "Borrar datos guardados"
    ]
    setList(m.menu, m.menuItems)
    m.menu.observeField("itemSelected", "onMenu")
    m.list.observeField("itemSelected", "onListPick")
    m.task.observeField("result", "onTaskResult")
    m.video.observeField("state", "onVideoState")
    m.menu.setFocus(true)
    say("Listo. Configura una fuente y corre las pruebas. Al final, toma foto de esta pantalla.")
end sub

sub setList(node as object, labels as object)
    c = CreateObject("roSGNode", "ContentNode")
    for each t in labels
        it = c.createChild("ContentNode")
        it.title = t
    end for
    node.content = c
end sub

sub say(t as string)
    m.lines.unshift(t)
    if m.lines.Count() > 40 then m.lines.Pop()
    s = ""
    for each l in m.lines
        s = s + l + Chr(10)
    end for
    m.logLabel.text = s
end sub

function cfg(k as string) as string
    if m.reg.Exists(k) then return m.reg.Read(k)
    return ""
end function

' ---------- teclado: pide varios campos seguidos ----------

sub askFields(fields as object)
    m.askQueue = fields
    askNext()
end sub

sub askNext()
    if m.askQueue.Count() = 0 then
        m.reg.Flush()
        say("Guardado en este Roku.")
        m.menu.setFocus(true)
        return
    end if
    f = m.askQueue[0]
    d = CreateObject("roSGNode", "StandardKeyboardDialog")
    d.title = f.title
    d.message = [f.hint]
    d.buttons = ["Aceptar", "Cancelar"]
    d.text = cfg(f.key)
    if f.secure = true then d.textEditBox.secureMode = true
    d.observeField("buttonSelected", "onKeyboardButton")
    m.dialog = d
    m.top.dialog = d
end sub

sub onKeyboardButton()
    d = m.dialog
    if d.buttonSelected = 0 then
        f = m.askQueue.Shift()
        m.reg.Write(f.key, d.text.Trim())
    else
        m.askQueue = []
    end if
    d.close = true
    askNext()
end sub

' ---------- menú ----------

sub onMenu()
    i = m.menu.itemSelected
    if i = 0 then
        askFields([
            { key: "xserver", title: "Servidor Xtream", hint: "Ej. http://servidor:puerto" },
            { key: "xuser", title: "Usuario", hint: "Usuario de tu cuenta Xtream" },
            { key: "xpass", title: "Contraseña", hint: "Se guarda solo en este Roku", secure: true }
        ])
    else if i = 1 then
        askFields([
            { key: "sportal", title: "URL del portal Stalker", hint: "Ej. http://portal/stalker_portal/c/" },
            { key: "smac", title: "MAC", hint: "00:1A:79:XX:XX:XX" }
        ])
    else if i = 2 then
        runTask({ kind: "xtream", server: cfg("xserver"), user: cfg("xuser"), pass: cfg("xpass") }, "Cargando canales Xtream…")
    else if i = 3 then
        runTask({ kind: "vod", server: cfg("xserver"), user: cfg("xuser"), pass: cfg("xpass") }, "Cargando películas…")
    else if i = 4 then
        runTask({ kind: "stalker", portal: cfg("sportal"), mac: cfg("smac") }, "Conectando al portal…")
    else if i = 5 then
        m.lines = []
        say("Resultados borrados.")
    else if i = 6 then
        for each k in ["xserver", "xuser", "xpass", "sportal", "smac"]
            m.reg.Delete(k)
        end for
        m.reg.Flush()
        say("Datos borrados de este Roku.")
    end if
end sub

sub runTask(req as object, msg as string)
    say(msg)
    m.task.control = "stop"
    m.task.request = req
    m.task.control = "run"
end sub

sub onTaskResult()
    r = m.task.result
    for each l in r.log
        say(l)
    end for
    if r.kind = "stalkerLink" then
        if r.ok then
            playUrl(r.link, "", m.pendingTitle + " (Stalker)", true)
        else
            say("El portal no devolvió enlace.")
        end if
        return
    end if
    if not r.ok then
        say("La prueba no terminó. Revisa los datos de la fuente.")
        return
    end if
    m.listKind = r.kind
    m.items = r.channels
    m.base = r.base
    m.stalker = { api: r.api, token: r.token }
    labels = []
    for each c in r.channels
        labels.push(c.name)
    end for
    setList(m.list, labels)
    m.menu.visible = false
    m.list.visible = true
    m.list.setFocus(true)
    m.mode = "list"
    say("Elige un canal. En cada canal se prueba un formato distinto con el botón *.")
end sub

' ---------- elegir canal y formato ----------

sub onListPick()
    c = m.items[m.list.itemSelected]
    m.pendingTitle = c.name
    if m.listKind = "xtream" then
        if m.fmt = invalid then m.fmt = 0
        u = m.base + "/live/" + enc(cfg("xuser")) + "/" + enc(cfg("xpass")) + "/" + c.id
        if m.fmt = 0 then
            playUrl(u + ".ts", "", c.name + " · .ts (sin formato)", false)
        else if m.fmt = 1 then
            playUrl(u + ".ts", "ts", c.name + " · .ts (streamFormat ts)", false)
        else
            playUrl(u + ".m3u8", "hls", c.name + " · .m3u8 (HLS)", false)
        end if
    else if m.listKind = "vod" then
        u = m.base + "/movie/" + enc(cfg("xuser")) + "/" + enc(cfg("xpass")) + "/" + c.id + "." + c.ext
        f = ""
        if c.ext = "mp4" or c.ext = "mkv" then f = c.ext
        playUrl(u, f, c.name, false)
    else if m.listKind = "stalker" then
        say("Pidiendo enlace al portal…")
        m.task.control = "stop"
        m.task.request = { kind: "stalkerLink", api: m.stalker.api, token: m.stalker.token, mac: cfg("smac"), cmd: c.cmd }
        m.task.control = "run"
    end if
end sub

function enc(s as string) as string
    return CreateObject("roUrlTransfer").Escape(s)
end function

function fmtName() as string
    if m.fmt = invalid or m.fmt = 0 then return ".ts sin formato"
    if m.fmt = 1 then return ".ts como 'ts'"
    return ".m3u8 como HLS"
end function

' ---------- reproducción ----------

sub playUrl(url as string, streamFormat as string, title as string, stalker as boolean)
    content = CreateObject("roSGNode", "ContentNode")
    content.url = url
    content.title = title
    if streamFormat <> "" then content.streamFormat = streamFormat
    if stalker then
        content.HttpHeaders = [
            "User-Agent: Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3",
            "Cookie: mac=" + enc(UCase(cfg("smac"))) + "; stb_lang=es; timezone=" + enc("America/Mexico_City")
        ]
    end if
    m.playTitle = title
    m.playTimer = CreateObject("roTimespan")
    m.playReported = false
    m.video.content = content
    m.video.visible = true
    m.hud.visible = true
    m.hudText.visible = true
    m.hudText.text = title + " · conectando…"
    m.video.control = "play"
    m.video.setFocus(true)
    m.mode = "video"
end sub

sub onVideoState()
    st = m.video.state
    if st = "playing" and not m.playReported then
        m.playReported = true
        ms = m.playTimer.TotalMilliseconds()
        info = ""
        si = m.video.streamInfo
        if si <> invalid and si.measuredBitrate <> invalid then info = " · " + Str(Int(si.measuredBitrate / 1000)).Trim() + " kbps medidos"
        vf = ""
        if m.video.videoFormat <> invalid then vf = " · video " + m.video.videoFormat
        af = ""
        if m.video.audioFormat <> invalid then af = " · audio " + m.video.audioFormat
        line = "OK " + m.playTitle + ": arrancó en " + Str(ms).Trim() + " ms" + vf + af + info
        say(line)
        m.hudText.text = line + Chr(10) + "Atrás = volver a la lista"
    else if st = "error" then
        line = "FALLÓ " + m.playTitle + ": código " + Str(m.video.errorCode).Trim() + " · " + m.video.errorMsg
        if m.video.errorStr <> invalid and m.video.errorStr <> "" then line = line + " · " + m.video.errorStr
        say(line)
        m.hudText.text = line + Chr(10) + "Atrás = volver a la lista"
    else if st = "buffering" then
        if m.playReported then say("Buffering en " + m.playTitle)
    else if st = "finished" then
        say("Terminó: " + m.playTitle)
    end if
end sub

sub stopVideo()
    m.video.control = "stop"
    m.video.visible = false
    m.hud.visible = false
    m.hudText.visible = false
    m.list.setFocus(true)
    m.mode = "list"
end sub

function onKeyEvent(key as string, press as boolean) as boolean
    if not press then return false
    if key = "back" then
        if m.mode = "video" then
            stopVideo()
            return true
        else if m.mode = "list" then
            m.list.visible = false
            m.menu.visible = true
            m.menu.setFocus(true)
            m.mode = "menu"
            return true
        end if
    else if key = "options" and m.mode = "list" and m.listKind = "xtream" then
        if m.fmt = invalid then m.fmt = 0
        m.fmt = (m.fmt + 1) mod 3
        say("Formato para el siguiente canal: " + fmtName())
        return true
    else if key = "options" and m.mode = "video" then
        m.hud.visible = not m.hud.visible
        m.hudText.visible = m.hud.visible
        return true
    end if
    return false
end function
