import { MARKET_GREEN, MARKET_RED } from './market-colours.ts';

export const DESKTOP_CHART_MEDIA='(min-width: 941px) and (hover: hover) and (pointer: fine)';
export type DesktopChartScope={mediaMatches:boolean;platform:string|null|undefined;section:string|null|undefined;native:boolean};
export function isDesktopWebChart(scope:DesktopChartScope){return scope.mediaMatches&&scope.platform==='web'&&['trade','fno'].includes(scope.section??'')&&!scope.native;}
/** Baseline values deliberately remain identical for mobile and native hosts. */
export function chartCanvasPalette(theme:'light'|'neon',scope:DesktopChartScope){
 const desktop=isDesktopWebChart(scope),dark=theme==='neon';
 return {
  desktop,accent:desktop?'#2962ff':dark?'#bf9aff':'#8054da',
  background:desktop?dark?'#0f0f0f':'#ffffff':dark?'#0c142b':'#ffffff',
  text:desktop?dark?'#b2b5be':'#787b86':dark?'#a4adc7':'#65708a',
  grid:desktop?dark?'#2e2e2e':'#f0f3fa':dark?'#19233c':'#edf0f6',
  border:desktop?dark?'#2e2e2e':'#ebebeb':dark?'#2c3859':'#dfe3ec',
  separator:desktop?dark?'#2e2e2e':'#ebebeb':dark?'#2c3859':'#e3e6ee',
  separatorHover:desktop?'#2962ff':dark?'#bf9aff':'#d8d3ff',
  crosshair:desktop?'#787b86':dark?'#bf9aff':'#8c96aa',
  crosshairLabel:desktop?dark?'#363a45':'#2a2e39':dark?'#342353':'#252b3d',
  up:desktop?'#089981':MARKET_GREEN,down:desktop?'#f23645':MARKET_RED,
 };
}
