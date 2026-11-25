' Lógica del componente RowItem.

sub init()
    m.bg = m.top.findNode("bg")
    m.num = m.top.findNode("num")
    m.logo = m.top.findNode("logo")
    m.title = m.top.findNode("title")
    m.sub = m.top.findNode("sub")
    m.right = m.top.findNode("right")
    m.icon = m.top.findNode("icon")
    m.cur = invalid
end sub

function f(c as object, k as string) as string
    if c = invalid then return ""
    v = c.getField(k)
    if v = invalid then return ""
    return v
end function

sub setContent()
    if m.cur <> invalid then
        m.cur.unobserveFieldScoped("sub")
        m.cur.unobserveFieldScoped("on")
        m.cur.unobserveFieldScoped("right")
        m.cur.unobserveFieldScoped("icon")
    end if
    m.cur = m.top.itemContent
    if m.cur <> invalid then
        m.cur.observeFieldScoped("sub", "layout")
        m.cur.observeFieldScoped("on", "paint")
        m.cur.observeFieldScoped("right", "layout")
        m.cur.observeFieldScoped("icon", "layout")
    end if
    layout()
end sub

sub layout()
    c = m.top.itemContent
    if c = invalid then return
    w = m.top.width
    h = m.top.height
    if w <= 0 or h <= 0 then return
    m.bg.width = w
    m.bg.height = h
    x = 18
    n = f(c, "num")
    if n <> "" then
        m.num.text = n
        m.num.translation = [x, 0]
        m.num.width = 58
        m.num.height = h
        m.num.visible = true
        x = x + 74
    else
        m.num.visible = false
    end if
    if c.HDPosterUrl <> invalid and c.HDPosterUrl <> "" then
        lh = h - 24
        if lh > 56 then lh = 56
        m.logo.uri = c.HDPosterUrl
        m.logo.width = Int(lh * 16 / 9)
        m.logo.height = lh
        m.logo.translation = [x, Int((h - lh) / 2)]
        m.logo.visible = true
        x = x + m.logo.width + 16
    else
        m.logo.uri = ""
        m.logo.visible = false
    end if
    rw = 0
    ic = f(c, "icon")
    if ic <> "" then
        m.icon.uri = ic
        m.icon.translation = [w - 46, Int((h - 28) / 2)]
        m.icon.visible = true
        rw = 44
    else
        m.icon.visible = false
    end if
    r = f(c, "right")
    if r <> "" then
        m.right.text = r
        m.right.width = 220
        m.right.height = h
        m.right.translation = [w - 18 - rw - 220, 0]
        m.right.visible = true
        rw = rw + 236
    else
        m.right.visible = false
    end if
    tw = w - x - 18 - rw
    if tw < 60 then tw = 60
    m.title.text = c.title
    m.title.width = tw
    s = f(c, "sub")
    if s <> "" and h >= 76 then
        m.title.translation = [x, Int(h / 2) - 36]
        m.title.height = 40
        m.sub.text = s
        m.sub.width = tw
        m.sub.height = 32
        m.sub.translation = [x, Int(h / 2) + 2]
        m.sub.visible = true
    else
        m.title.translation = [x, 0]
        m.title.height = h
        m.sub.visible = false
    end if
    paint()
end sub

sub paint()
    c = m.top.itemContent
    if c = invalid then return
    focused = m.top.focusPercent > 0.5
    hit = f(c, "on") = "1"
    if focused and m.top.listHasFocus then
        m.bg.opacity = 1
        m.bg.blendColor = "0xD7F36AFF"
        m.title.color = "0x0A0B0DFF"
        m.sub.color = "0x0A0B0DB3"
        m.num.color = "0x0A0B0DB3"
        m.right.color = "0x0A0B0DB3"
        m.icon.blendColor = "0x0A0B0DFF"
    else
        if focused then
            m.bg.opacity = 1
            m.bg.blendColor = "0x262A31FF"
        else
            m.bg.opacity = 0
        end if
        if hit then m.title.color = "0xD7F36AFF" else m.title.color = "0xF4F5F7FF"
        m.sub.color = "0xA4AAB4FF"
        m.num.color = "0x8A9099FF"
        m.right.color = "0xA4AAB4FF"
        m.icon.blendColor = "0xD7F36AFF"
    end if
end sub
