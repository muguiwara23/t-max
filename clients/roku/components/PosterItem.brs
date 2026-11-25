' Lógica del componente PosterItem.

sub init()
    m.ring = m.top.findNode("ring")
    m.poster = m.top.findNode("poster")
    m.phText = m.top.findNode("phText")
    m.bar = m.top.findNode("bar")
    m.barBg = m.top.findNode("barBg")
    m.done = m.top.findNode("done")
    m.title = m.top.findNode("title")
    m.sub = m.top.findNode("sub")
end sub

function f(c as object, k as string) as dynamic
    if c = invalid then return invalid
    return c.getField(k)
end function

sub setContent()
    c = m.top.itemContent
    if c = invalid then return
    m.title.text = c.title
    m.phText.text = c.title
    m.poster.uri = c.HDPosterUrl
    s = f(c, "sub")
    if s = invalid then s = ""
    m.sub.text = s
    p = f(c, "prog")
    if p = invalid then p = 0
    m.barBg.visible = p > 0.01 and p < 1
    m.bar.visible = m.barBg.visible
    m.bar.width = Int(204 * p)
    m.done.visible = p >= 1
    paint()
end sub

sub paint()
    hit = m.top.focusPercent > 0.5
    if hit and m.top.gridHasFocus then
        m.ring.opacity = 1
        m.title.color = "0xF4F5F7FF"
    else
        m.ring.opacity = 0
        m.title.color = "0xA4AAB4FF"
    end if
end sub
