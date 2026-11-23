import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type IconName =
  | 'live' | 'movies' | 'series' | 'bell' | 'dvr' | 'settings' | 'search' | 'guide' | 'star' | 'starFilled'
  | 'play' | 'pause' | 'prev' | 'next' | 'back' | 'chevron' | 'chevronDown' | 'subtitles' | 'audio' | 'list'
  | 'expand' | 'close' | 'plus' | 'refresh' | 'trash' | 'edit' | 'replay' | 'forward' | 'check' | 'restart' | 'skipNext';

interface Props {
  name: IconName;
  size?: number;
  color?: string;
}

export default function Icon({ name, size = 22, color = '#F4F5F7' }: Props) {
  const s = { stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  const f = { fill: color };
  let body;
  switch (name) {
    case 'live': body = <><Rect x={3} y={7} width={18} height={13} rx={2} {...s} /><Path d="m8 3 4 4 4-4" {...s} /></>; break;
    case 'movies': body = <><Rect x={3} y={3} width={18} height={18} rx={2} {...s} /><Path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4" {...s} /></>; break;
    case 'series': body = <><Path d="m12 3 9 5-9 5-9-5 9-5z" {...s} /><Path d="m3 13 9 5 9-5" {...s} /></>; break;
    case 'bell': body = <><Path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8" {...s} /><Path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" {...s} /></>; break;
    case 'dvr': body = <><Circle cx={12} cy={12} r={9} {...s} /><Circle cx={12} cy={12} r={4} {...f} /></>; break;
    case 'settings': body = <><Circle cx={12} cy={12} r={3} {...s} /><Path d="M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" {...s} /></>; break;
    case 'search': body = <><Circle cx={11} cy={11} r={7} {...s} /><Path d="m20 20-3.5-3.5" {...s} /></>; break;
    case 'guide': body = <><Rect x={3} y={4} width={18} height={17} rx={2} {...s} /><Path d="M3 10h18M9 4v17" {...s} /></>; break;
    case 'star': body = <Path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3z" {...s} />; break;
    case 'starFilled': body = <Path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3z" {...f} />; break;
    case 'play': body = <Path d="M7 4v16l13-8z" {...f} />; break;
    case 'pause': body = <><Rect x={6} y={4} width={4} height={16} rx={1} {...f} /><Rect x={14} y={4} width={4} height={16} rx={1} {...f} /></>; break;
    case 'prev': body = <><Path d="M6 5v14" {...s} /><Path d="M18 5 9 12l9 7z" {...s} /></>; break;
    case 'next': body = <><Path d="M18 5v14" {...s} /><Path d="M6 5l9 7-9 7z" {...s} /></>; break;
    case 'back': body = <Path d="m15 18-6-6 6-6" {...s} />; break;
    case 'chevron': body = <Path d="m9 6 6 6-6 6" {...s} />; break;
    case 'chevronDown': body = <Path d="m6 9 6 6 6-6" {...s} />; break;
    case 'subtitles': body = <><Rect x={3} y={5} width={18} height={14} rx={2} {...s} /><Path d="M10 10.5a2 2 0 1 0 0 3M17 10.5a2 2 0 1 0 0 3" {...s} /></>; break;
    case 'audio': body = <><Path d="M4 9v6h4l5 4V5L8 9z" {...s} /><Path d="M16.5 9a4 4 0 0 1 0 6" {...s} /></>; break;
    case 'list': body = <Path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" {...s} />; break;
    case 'expand': body = <Path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" {...s} />; break;
    case 'close': body = <Path d="M18 6 6 18M6 6l12 12" {...s} />; break;
    case 'plus': body = <Path d="M12 5v14M5 12h14" {...s} />; break;
    case 'refresh': body = <><Path d="M3 12a9 9 0 1 0 3-6.7L3 8" {...s} /><Path d="M3 3v5h5" {...s} /></>; break;
    case 'trash': body = <Path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" {...s} />; break;
    case 'edit': body = <Path d="M4 20h4L19 9l-4-4L4 16v4z" {...s} />; break;
    case 'replay': body = <><Path d="M4 12a8 8 0 1 0 2.4-5.7" {...s} /><Path d="M4 4v4h4" {...s} /></>; break;
    case 'forward': body = <><Path d="M20 12a8 8 0 1 1-2.4-5.7" {...s} /><Path d="M20 4v4h-4" {...s} /></>; break;
    case 'check': body = <Path d="m5 12 5 5 9-10" {...s} />; break;
    case 'restart': body = <><Path d="M5 5v14" {...s} /><Path d="M19 6 10 12l9 6z" {...f} /></>; break;
    case 'skipNext': body = <><Path d="M5 6l9 6-9 6z" {...f} /><Path d="M18 5v14" {...s} /></>; break;
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {body}
    </Svg>
  );
}
