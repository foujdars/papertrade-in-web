import { MARKET_GREEN, MARKET_RED } from './market-colours.ts';

export const DESKTOP_CHART_MEDIA='(min-width: 941px) and (hover: hover) and (pointer: fine)';
export type DesktopChartScope={mediaMatches:boolean;platform:string|null|undefined;section:string|null|undefined;native:boolean};
export function isDesktopWebChart(scope:DesktopChartScope){return scope.mediaMatches&&scope.platform==='web'&&['trade','fno'].includes(scope.section??'')&&!scope.native;}
/** Shared canvas palette follows the app theme on desktop, mobile and native. */
export function chartCanvasPalette(theme:'light'|'neon',scope:DesktopChartScope){
 const desktop=isDesktopWebChart(scope),dark=theme==='neon';
 return {
  desktop,accent:dark?'#53f2df':'#6541df',
  background:dark?'#111c2d':'#edf0ff',
  text:dark?'#a9bdd6':'#526185',
  grid:dark?'#1e3047':'#dce2f6',
  border:dark?'#30455f':'#c9d3ef',
  separator:dark?'#30455f':'#c9d3ef',
  separatorHover:dark?'#53f2df':'#6541df',
  crosshair:dark?'#53f2df':'#526185',
  crosshairLabel:dark?'#102e33':'#202b50',
  up:desktop?'#089981':MARKET_GREEN,down:desktop?'#f23645':MARKET_RED,
 };
}
