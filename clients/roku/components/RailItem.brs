' Lógica del componente RailItem.

sub init()
    m.bg = m.top.findNode("bg")
    m.icon = m.top.findNode("icon")
    m.label = m.top.findNode("label")
    m.cur = invalid
end sub

sub setContent()
    if m.cur <> invalid then m.cur.unobserveFieldScoped("ShortDescriptionLine1")
    m.cur = m.top.itemContent
    if m.cur <> invalid then m.cur.observeFieldScoped("ShortDescriptionLine1", "draw")
    draw()
end sub

sub draw()
    c = m.top.itemContent
    if c = invalid then return
    m.icon.uri = c.HDPosterUrl
    m.label.text = c.title
    focused = m.top.focusPercent > 0.5
    current = c.ShortDescriptionLine1 = "1"
    if focused and m.top.listHasFocus then
        m.bg.opacity = 1
        m.bg.blendColor = "0xD7F36AFF"
        m.icon.blendColor = "0x0A0B0DFF"
        m.label.color = "0x0A0B0DFF"
    else if current then
        m.bg.opacity = 1
        m.bg.blendColor = "0x262A31FF"
        m.icon.blendColor = "0xD7F36AFF"
        m.label.color = "0xF4F5F7FF"
    else
        m.bg.opacity = 0
        m.icon.blendColor = "0x8A9099FF"
        m.label.color = "0x8A9099FF"
    end if
end sub
