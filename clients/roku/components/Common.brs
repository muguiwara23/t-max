' Utilidades compartidas (escena y tareas): red, texto, fuentes guardadas.

function Txt(v as dynamic) as string
    if v = invalid then return ""
    t = type(v)
    if t = "roString" or t = "String" then return v
    if t = "roInt" or t = "Integer" or t = "roInteger" or t = "LongInteger" or t = "roLongInteger" then return v.ToStr()
    if t = "roFloat" or t = "Float" or t = "Double" or t = "roDouble" then return Str(v).Trim()
    if t = "roBoolean" or t = "Boolean" then
        if v then return "true"
        return "false"
    end if
    return ""
end function

function Esc(s as string) as string
    return CreateObject("roUrlTransfer").Escape(s)
end function

function TrimSlash(s as string) as string
    while Len(s) > 0 and Right(s, 1) = "/"
        s = Left(s, Len(s) - 1)
    end while
    return s
end function

' GET con cabeceras → { code, body, reason }.
function HttpGet(url as string, headers as object, timeoutMs as integer) as object
    x = CreateObject("roUrlTransfer")
    x.SetUrl(url)
    if LCase(Left(url, 6)) = "https:" then
        x.SetCertificatesFile("common:/certs/ca-bundle.crt")
        x.InitClientCertificates()
    end if
    x.EnableEncodings(true)
    x.RetainBodyOnError(true)
    if headers <> invalid then
        for each k in headers
            x.AddHeader(k, headers[k])
        end for
    end if
    port = CreateObject("roMessagePort")
    x.SetMessagePort(port)
    x.AsyncGetToString()
    msg = wait(timeoutMs, port)
    if type(msg) = "roUrlEvent" then return { code: msg.GetResponseCode(), body: msg.GetString(), reason: msg.GetFailureReason() }
    x.AsyncCancel()
    return { code: -1, body: "", reason: "El servidor no respondió a tiempo" }
end function

function LoadSources() as object
    reg = CreateObject("roRegistrySection", "tmax")
    if not reg.Exists("sources") then return []
    v = ParseJson(reg.Read("sources"))
    if type(v) <> "roArray" then return []
    return v
end function

sub SaveSources(list as object)
    reg = CreateObject("roRegistrySection", "tmax")
    reg.Write("sources", FormatJson(list))
    reg.Flush()
end sub

function XtreamBase(server as string) as string
    s = server.Trim()
    if LCase(Left(s, 4)) <> "http" then s = "http://" + s
    s = TrimSlash(s)
    i = Instr(1, s, "/player_api.php")
    if i > 0 then s = Left(s, i - 1)
    return s
end function

function XtreamApi(src as object, action as string) as string
    u = XtreamBase(src.server) + "/player_api.php?username=" + Esc(src.user) + "&password=" + Esc(src.pass)
    if action <> "" then u = u + "&action=" + action
    return u
end function

' ---- Stalker (misma identidad MAG250 que el núcleo de T-Max; basado en IPTVnator, MIT) ----

function StalkerApi(portal as string) as string
    u = portal.Trim()
    if LCase(Left(u, 4)) <> "http" then u = "http://" + u
    if Instr(1, LCase(u), ".php") > 0 then
        q = Instr(1, u, "?")
        if q > 0 then u = Left(u, q - 1)
        return u
    end if
    u = TrimSlash(u)
    if LCase(Right(u, 2)) = "/c" then u = Left(u, Len(u) - 2)
    if LCase(Right(u, 15)) = "/stalker_portal" then return u + "/server/load.php"
    return u + "/portal.php"
end function

function MagAgent() as string
    return "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG250"
end function

function StalkerHeaders(src as object, token as string) as object
    tz = CreateObject("roDateTime").GetTimeZone()
    if tz = "" then tz = "UTC"
    h = { "User-Agent": MagAgent(), "X-User-Agent": MagAgent(), "Cookie": "mac=" + UCase(src.mac) + "; stb_lang=en; timezone=" + tz, "Accept": "*/*" }
    if token <> "" then h["Authorization"] = "Bearer " + token
    return h
end function

function Sha1Upper(s as string) as string
    d = CreateObject("roEVPDigest")
    d.Setup("sha1")
    b = CreateObject("roByteArray")
    b.FromAsciiString(s)
    return UCase(d.Process(b))
end function

' cmd como lo manda un MAG: sin doble codificación, solo lo inseguro se escapa.
function StalkerCmd(v as string) as string
    safe = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.~!*()/:?@$,+=[]%"
    out = ""
    for i = 1 to Len(v)
        c = Mid(v, i, 1)
        if Instr(1, safe, c) > 0 then
            out = out + c
        else
            out = out + Esc(c)
        end if
    end for
    return out
end function

function StripCmd(c as string) as string
    s = c.Trim()
    sp = Instr(1, s, " ")
    if sp > 0 and LCase(Left(s, 4)) <> "http" then s = Mid(s, sp + 1).Trim()
    return s
end function

function FormatFor(url as string, pref as string) as string
    u = LCase(url)
    q = Instr(1, u, "?")
    if q > 0 then u = Left(u, q - 1)
    if Right(u, 5) = ".m3u8" then return "hls"
    if Right(u, 4) = ".mp4" then return "mp4"
    if Right(u, 4) = ".mkv" then return "mkv"
    if Right(u, 3) = ".ts" then return "ts"
    if pref = "m3u8" then return "hls"
    return "ts"
end function
