' Servidor HTTP mínimo (escrito para T-Max) sobre roStreamSocket.
' Solo sirve una página para agregar fuentes; nunca muestra contraseñas guardadas.
' Toda petición que cambie algo exige el PIN que se ve en la TV.

sub init()
    m.top.functionName = "serve"
end sub

function CRLF() as string
    return Chr(13) + Chr(10)
end function

sub serve()
    port = CreateObject("roMessagePort")
    addr = CreateObject("roSocketAddress")
    addr.setPort(m.top.port)
    srv = CreateObject("roStreamSocket")
    srv.setMessagePort(port)
    if not srv.setAddress(addr) then
        m.top.status = "error"
        return
    end if
    srv.notifyReadable(true)
    if not srv.listen(4) then
        m.top.status = "error"
        return
    end if
    m.top.status = "ok"
    m.fails = 0
    m.lockUntil = 0
    while true
        msg = wait(0, port)
        if type(msg) = "roSocketEvent" and msg.getSocketID() = srv.getID() and srv.isReadable() then
            c = srv.accept()
            if c <> invalid then
                try
                    handleClient(c)
                catch e
                    print "WebServer: "; e.message
                end try
                c.close()
            end if
        end if
    end while
end sub

sub handleClient(c as object)
    cp = CreateObject("roMessagePort")
    c.setMessagePort(cp)
    c.notifyReadable(true)
    data = ""
    headEnd = 0
    need = 0
    span = CreateObject("roTimespan")
    while span.TotalMilliseconds() < 6000
        n = c.getCountRcvBuf()
        if n > 0 then
            data = data + c.receiveStr(n)
        else
            ev = wait(400, cp)
            if ev <> invalid and c.getCountRcvBuf() = 0 and c.isReadable() then exit while ' el otro lado cerró
        end if
        if headEnd = 0 then
            p = Instr(1, data, CRLF() + CRLF())
            if p > 0 then
                headEnd = p + 3
                need = contentLength(Left(data, p))
            end if
        end if
        if headEnd > 0 and Len(data) - headEnd >= need then exit while
        if Len(data) > 32768 then exit while
    end while
    if headEnd = 0 then return
    first = Left(data, Instr(1, data, CRLF()) - 1)
    parts = first.Split(" ")
    if parts.Count() < 2 then return
    method = UCase(parts[0])
    path = parts[1]
    q = Instr(1, path, "?")
    if q > 0 then path = Left(path, q - 1)
    if method = "GET" and path = "/" then
        send(c, "200 OK", page("", ""))
    else if method = "POST" and path = "/add" then
        form = parseForm(Mid(data, headEnd + 1))
        send(c, "200 OK", addSource(form))
    else if path = "/favicon.ico" then
        send(c, "404 Not Found", "")
    else
        sendAll(c, "HTTP/1.1 303 See Other" + CRLF() + "Location: /" + CRLF() + "Content-Length: 0" + CRLF() + "Connection: close" + CRLF() + CRLF())
    end if
end sub

function contentLength(head as string) as integer
    for each line in head.Split(CRLF())
        if LCase(Left(line, 15)) = "content-length:" then return Mid(line, 16).Trim().ToInt()
    end for
    return 0
end function

function parseForm(body as string) as object
    out = {}
    u = CreateObject("roUrlTransfer")
    for each pair in body.Split("&")
        eq = Instr(1, pair, "=")
        if eq > 0 then
            k = Left(pair, eq - 1)
            v = u.Unescape(Mid(pair, eq + 1).Replace("+", " "))
            out[k] = v.Trim()
        end if
    end for
    return out
end function

function addSource(f as object) as string
    now = CreateObject("roDateTime").AsSeconds()
    if now < m.lockUntil then return page("", "Demasiados intentos con PIN incorrecto. Espera un minuto.")
    if Txt(f.pin) <> m.top.pin then
        m.fails = m.fails + 1
        if m.fails >= 5 then
            m.fails = 0
            m.lockUntil = now + 60
        end if
        return page("", "El PIN no coincide con el que se ve en la TV (Ajustes de T-Max).")
    end if
    m.fails = 0
    t = Txt(f.type)
    s = { type: t, id: CreateObject("roDeviceInfo").GetRandomUUID().Left(8), name: Txt(f.name), fmt: "ts" }
    if t = "xtream" then
        s.server = Txt(f.server)
        s.user = Txt(f.user)
        s.pass = Txt(f.pass)
        if Txt(f.fmt) = "m3u8" then s.fmt = "m3u8"
        if s.server = "" or s.user = "" or s.pass = "" then return page("", "Llena servidor, usuario y contraseña.")
    else if t = "m3u" then
        s.url = Txt(f.url)
        if LCase(Left(s.url, 4)) <> "http" then return page("", "La URL de la lista debe empezar con http:// o https://")
    else if t = "stalker" then
        s.server = Txt(f.server)
        s.mac = UCase(Txt(f.mac))
        re = CreateObject("roRegex", "^([0-9A-F]{2}:){5}[0-9A-F]{2}$", "")
        if s.server = "" or not re.IsMatch(s.mac) then return page("", "Llena la URL del portal y una MAC con formato 00:1A:79:XX:XX:XX.")
    else
        return page("", "Tipo de fuente desconocido.")
    end if
    if s.name = "" then
        if t = "xtream" then s.name = "Xtream"
        if t = "m3u" then s.name = "Lista M3U"
        if t = "stalker" then s.name = "Portal Stalker"
    end if
    list = LoadSources()
    list.push(s)
    SaveSources(list)
    reg = CreateObject("roRegistrySection", "tmax")
    reg.Write("srcIndex", (list.Count() - 1).ToStr())
    reg.Flush()
    m.top.changed = m.top.changed + 1
    return page("Listo: " + HtmlSafe(s.name) + " ya est&aacute; en tu Roku. Puedes agregar otra o volver a la TV.", "")
end function

' Texto seguro para HTML y solo ASCII (los acentos van como &#N;).
function HtmlSafe(s as string) as string
    out = ""
    for i = 1 to Len(s)
        ch = Mid(s, i, 1)
        a = Asc(ch)
        if ch = "&" then
            out = out + "&amp;"
        else if ch = "<" then
            out = out + "&lt;"
        else if ch = ">" then
            out = out + "&gt;"
        else if ch = Chr(34) then
            out = out + "&quot;"
        else if a > 126 or a < 32 then
            out = out + "&#" + a.ToStr() + ";"
        else
            out = out + ch
        end if
    end for
    return out
end function

function page(ok as string, err as string) as string
    q = Chr(34)
    names = ""
    for each s in LoadSources()
        names = names + "<li>" + UCase(Txt(s.type)) + " &middot; " + HtmlSafe(Txt(s.name)) + "</li>"
    end for
    if names = "" then names = "<li>Todav&iacute;a no hay fuentes.</li>"
    msg = ""
    if ok <> "" then msg = "<p class=ok>" + ok + "</p>"
    if err <> "" then msg = "<p class=err>" + HtmlSafe(err) + "</p>"
    css = "body{margin:0;background:#0A0B0D;color:#F4F5F7;font:16px -apple-system,Roboto,sans-serif}main{max-width:560px;margin:auto;padding:20px}h1{color:#D7F36A;margin:8px 0}"
    css = css + ".card{background:#14161A;border-radius:18px;padding:18px;margin:14px 0}label{display:block;color:#A4AAB4;margin:12px 0 6px}"
    css = css + "input,select{width:100%;box-sizing:border-box;padding:12px 14px;border-radius:12px;border:0;background:#262A31;color:#F4F5F7;font-size:17px}"
    css = css + "button{width:100%;margin-top:18px;padding:14px;border:0;border-radius:14px;background:#D7F36A;color:#0A0B0D;font-weight:700;font-size:17px}"
    css = css + ".tabs{display:flex;gap:8px}.tabs a{flex:1;text-align:center;padding:10px;border-radius:12px;background:#262A31;color:#F4F5F7;text-decoration:none}.tabs a.on{background:#D7F36A;color:#0A0B0D;font-weight:700}"
    css = css + ".ok{background:#1E3A1E;padding:12px;border-radius:12px}.err{background:#4A1F1F;padding:12px;border-radius:12px}small{color:#8A9099}ul{padding-left:20px;color:#A4AAB4}"
    js = "function t(k){document.getElementById('type').value=k;for(const e of document.querySelectorAll('[data-t]'))e.style.display=e.dataset.t.includes(k)?'block':'none';"
    js = js + "for(const a of document.querySelectorAll('.tabs a'))a.className=a.dataset.k==k?'on':''}window.onload=function(){t('xtream')}"
    f = "<form method=post action=/add autocomplete=off><input type=hidden id=type name=type value=xtream>"
    f = f + "<div class=tabs><a href=# data-k=xtream onclick=" + q + "t('xtream');return false" + q + ">Xtream</a><a href=# data-k=m3u onclick=" + q + "t('m3u');return false" + q + ">Lista M3U</a><a href=# data-k=stalker onclick=" + q + "t('stalker');return false" + q + ">Stalker</a></div>"
    f = f + "<label>Nombre</label><input name=name placeholder=" + q + "Ej. Mi servidor" + q + ">"
    f = f + "<div data-t=xtream,stalker><label>Servidor (o URL del portal)</label><input name=server inputmode=url autocapitalize=off placeholder=" + q + "http://servidor:puerto" + q + "></div>"
    f = f + "<div data-t=xtream><label>Usuario</label><input name=user autocapitalize=off><label>Contrase&ntilde;a</label><input name=pass type=password>"
    f = f + "<label>Formato de canales</label><select name=fmt><option value=ts>TS (recomendado)</option><option value=m3u8>M3U8 / HLS</option></select></div>"
    f = f + "<div data-t=m3u><label>URL de la lista M3U</label><input name=url inputmode=url autocapitalize=off placeholder=" + q + "https://.../lista.m3u" + q + "></div>"
    f = f + "<div data-t=stalker><label>MAC</label><input name=mac autocapitalize=characters placeholder=" + q + "00:1A:79:XX:XX:XX" + q + "></div>"
    f = f + "<label>PIN que se ve en la TV</label><input name=pin inputmode=numeric maxlength=4 required>"
    f = f + "<button>Guardar en el Roku</button></form>"
    html = "<!doctype html><html lang=es><head><meta charset=utf-8><meta name=viewport content=" + q + "width=device-width,initial-scale=1" + q + "><title>T-Max</title><style>" + css + "</style><script>" + js + "</script></head><body><main>"
    html = html + "<h1>T-Max</h1><small>Configura tu Roku desde el celular. Los datos viajan solo por tu red local, directo al Roku.</small>" + msg
    html = html + "<div class=card>" + f + "</div><div class=card><b>Fuentes en el Roku</b><ul>" + names + "</ul><small>Para cambiar el formato o borrar una fuente usa Ajustes en la TV.</small></div></main></body></html>"
    return html
end function

sub send(c as object, status as string, body as string)
    head = "HTTP/1.1 " + status + CRLF() + "Content-Type: text/html; charset=utf-8" + CRLF() + "Content-Length: " + Len(body).ToStr() + CRLF()
    head = head + "Cache-Control: no-store" + CRLF() + "Connection: close" + CRLF() + CRLF()
    sendAll(c, head + body)
end sub

sub sendAll(c as object, text as string)
    rest = text
    tries = 0
    while Len(rest) > 0 and tries < 200
        sent = c.sendStr(rest)
        if sent > 0 then
            rest = Mid(rest, sent + 1)
            tries = 0
        else
            tries = tries + 1
            sleep(15)
        end if
    end while
end sub
