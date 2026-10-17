/** Editor reference data; execution support is determined by the runtime diagnostics. */
export type PineReference = { name: string; signature: string; description: string; snippet?: string; variable?: boolean };
const fn = (name: string, parameters: string, description: string, snippet?: string): PineReference => ({ name, signature: `${name}(${parameters})`, description, snippet });
export const PINE_REFERENCE: PineReference[] = [
 fn('indicator', 'title, shorttitle, overlay, format, precision', 'Declares an indicator and its chart placement.', 'indicator("${1:My indicator}", overlay=${2:true})'),
 fn('strategy', 'title, overlay, initial_capital, default_qty_type, default_qty_value', 'Declares a strategy with historical order simulation.', 'strategy("${1:My strategy}", overlay=true, initial_capital=${2:100000})'),
 fn('plot', 'series, title, color, linewidth, style, offset', 'Plots a numeric series. A positive offset shifts its display into later bars.', 'plot(${1:close}, title="${2:Plot}", color=${3:color.blue})'),
 fn('hline', 'price, title, color, linestyle, linewidth', 'Draws a constant horizontal price level.', 'hline(${1:0}, "${2:Level}", color.gray)'),
 fn('fill', 'plot1, plot2, color, title, editable, show_last, fillgaps', 'Fills the area between two plot IDs or two horizontal level IDs.', 'fill(${1:upper}, ${2:lower}, color.new(${3:color.blue}, ${4:85}))'),
 fn('plotshape', 'series, title, style, location, color, offset, text, textcolor, editable, size', 'Draws a shape where the condition is true.', 'plotshape(${1:condition}, style=shape.triangleup, location=location.belowbar, color=color.green)'),
 fn('plotchar', 'series, title, char, location, color, offset, text, textcolor, editable, size', 'Draws a character for a condition or numeric series.'),
 fn('plotarrow', 'series, title, colorup, colordown, offset', 'Draws up or down arrows based on the sign of a numeric series.'),
 fn('plotcandle', 'open, high, low, close, title, color, wickcolor, editable, show_last, bordercolor', 'Displays custom candle data.'),
 fn('barcolor', 'color, offset, editable, show_last, title', 'Changes the color of chart candles.'),
 fn('bgcolor', 'color, offset, editable, show_last, title', 'Colors the background of a pane.'),
 fn('alertcondition', 'condition, title, message', 'Declares a named alert condition. Notification delivery requires app alert setup.', 'alertcondition(${1:condition}, "${2:Signal}", "${3:Condition matched}")'),
 fn('alert', 'message, freq', 'Produces a script alert event.'),
 ...(['int','float','bool','string','source','color','timeframe','symbol','session','time','price','text_area'] as const).map(type => fn(`input.${type}`, ['int','float'].includes(type)?'defval, title, minval, maxval, step, tooltip, inline, group, confirm, display':'defval, title, tooltip, inline, group, confirm, display', `Creates a configurable ${type} script input.`, 'input.'+type+'('+(type==='bool'?'${1:true}':type==='source'?'${1:close}':type==='color'?'${1:color.blue}':['int','float','time','price'].includes(type)?'${1:14}':'"${1:}"')+', "${2:Input}")')),
 ...['sma','ema','rma','wma','vwma','hma','rsi','stdev','variance','highest','lowest','highestbars','lowestbars','roc','mom','change','rising','falling'].map(name => fn(`ta.${name}`, 'source, length', `${name.toUpperCase()} calculation over a source series.`, `ta.${name}(\${1:close}, \${2:14})`)),
 fn('ta.atr', 'length', 'Average true range with Wilder smoothing.', 'ta.atr(${1:14})'),
 fn('ta.tr', 'handle_na', 'True range of the current bar.'),
 fn('ta.vwap', 'source, anchor, stdev_mult', 'Volume-weighted average price.'),
 fn('ta.bb', 'series, length, mult', 'Returns the basis, upper band and lower band as a tuple.', 'ta.bb(${1:close}, ${2:20}, ${3:2})'),
 fn('ta.macd', 'source, fastlen, slowlen, siglen', 'Returns MACD, signal and histogram series.', 'ta.macd(${1:close}, ${2:12}, ${3:26}, ${4:9})'),
 fn('ta.supertrend', 'factor, atrPeriod', 'Returns the supertrend series and direction.', 'ta.supertrend(${1:3}, ${2:10})'),
 fn('ta.stoch', 'source, peak, valley, period', 'Stochastic oscillator.'),
 fn('ta.dmi', 'diLength, adxSmoothing', 'Returns positive DI, negative DI and ADX.'),
 fn('ta.pivothigh', 'source, leftbars, rightbars', 'Confirms a pivot high after the right-hand bars have elapsed.'),
 fn('ta.pivotlow', 'source, leftbars, rightbars', 'Confirms a pivot low after the right-hand bars have elapsed.'),
 ...['cross','crossover','crossunder'].map(name => fn(`ta.${name}`, 'source1, source2', `Tests whether two series ${name === 'crossover' ? 'cross upward' : name === 'crossunder' ? 'cross downward' : 'cross'}.`, `ta.${name}(\${1:close}, \${2:average})`)),
 fn('ta.valuewhen', 'condition, source, occurrence', 'Returns a source value from a prior condition occurrence.'),
 fn('ta.barssince', 'condition', 'Number of bars since the condition last matched.'),
 fn('ta.linreg', 'source, length, offset', 'Least-squares linear regression value.'),
 fn('request.security', 'symbol, timeframe, expression, gaps, lookahead, ignore_invalid_symbol', 'Requests an expression on another available symbol/timeframe. Data availability and runtime restrictions apply.', 'request.security(${1:syminfo.tickerid}, "${2:D}", ${3:close}, lookahead=barmerge.lookahead_off)'),
 fn('request.security_lower_tf', 'symbol, timeframe, expression, ignore_invalid_timeframe', 'Requests lower-timeframe values. Check runtime support before relying on results.'),
 fn('strategy.entry', 'id, direction, qty, limit, stop, oca_name, oca_type, comment', 'Creates a simulated entry order.', 'strategy.entry("${1:Long}", strategy.${2:long})'),
 fn('strategy.exit', 'id, from_entry, qty, qty_percent, profit, limit, loss, stop, trail_price, trail_points, trail_offset', 'Creates simulated exit orders with stop, limit or trailing levels.', 'strategy.exit("${1:Exit}", "${2:Long}", stop=${3:stopPrice}, limit=${4:targetPrice})'),
 fn('strategy.close', 'id, comment, qty, qty_percent, immediately', 'Closes an entry using a simulated market order.', 'strategy.close("${1:Long}")'),
 fn('strategy.close_all', 'comment, alert_message, immediately', 'Closes all simulated positions.'),
 fn('strategy.order', 'id, direction, qty, limit, stop', 'Creates a simulated order independent of the entry pyramiding setting.'),
 fn('strategy.cancel', 'id', 'Cancels unfilled simulated orders with the given ID.'),
 fn('strategy.cancel_all', '', 'Cancels all unfilled simulated orders.'),
 fn('color.new', 'color, transp', 'Sets transparency from 0 (opaque) to 100 (invisible).', 'color.new(${1:color.blue}, ${2:80})'),
 fn('color.rgb', 'red, green, blue, transp', 'Creates a color from RGB components and optional transparency.'),
 fn('color.from_gradient', 'value, bottom_value, top_value, bottom_color, top_color', 'Interpolates a color along a numeric range.'),
 ...['abs','ceil','floor','round','sqrt','log','exp','sign'].map(name => fn(`math.${name}`, 'number', `Returns the ${name} of the supplied number.`)),
 ...['min','max','avg','pow'].map(name => fn(`math.${name}`, 'number1, number2', `Calculates ${name} for the supplied values.`)),
 fn('nz', 'source, replacement', 'Replaces an unavailable value with zero or an explicit replacement.'),
 fn('na', 'x', 'Returns true if a value is unavailable.'),
 fn('str.tostring', 'value, format', 'Converts a value to a string.'),
 fn('str.format', 'formatString, arg0, arg1', 'Formats a string using indexed placeholders.'),
 fn('array.new_float', 'size, initial_value', 'Creates an array of floating point values.'),
 fn('array.from', 'arg0, arg1', 'Creates an array from supplied elements.'),
 ...['get','set','push','pop','shift','unshift','size','clear','avg','sum','max','min','sort'].map(name=>fn(`array.${name}`, name==='set'?'id, index, value':name==='get'?'id, index':name==='push'||name==='unshift'?'id, value':'id', `Array ${name} operation.`)),
 fn('line.new', 'x1, y1, x2, y2, xloc, extend, color, style, width', 'Creates a line drawing.', 'line.new(bar_index[${1:10}], ${2:close[10]}, bar_index, ${3:close}, color=color.blue)'),
 fn('line.set_xy1', 'id, x, y', 'Moves the first point of an existing line.'),
 fn('line.set_xy2', 'id, x, y', 'Moves the second point of an existing line.'),
 fn('line.delete', 'id', 'Removes a line drawing.'),
 fn('label.new', 'x, y, text, xloc, yloc, color, style, textcolor, size', 'Creates a text label.', 'label.new(bar_index, ${1:high}, "${2:Signal}", style=label.style_label_down)'),
 fn('label.set_text', 'id, text', 'Updates the text of an existing label.'),
 fn('label.delete', 'id', 'Removes a label.'),
 fn('box.new', 'left, top, right, bottom, border_color, border_width, border_style, extend, xloc, bgcolor', 'Creates a rectangular chart drawing.'),
 fn('box.delete', 'id', 'Removes a box drawing.'),
 fn('table.new', 'position, columns, rows, bgcolor, frame_color, frame_width, border_color, border_width', 'Creates a fixed-position table.', 'table.new(position.${1:top_right}, ${2:2}, ${3:2})'),
 fn('table.cell', 'table_id, column, row, text, width, height, text_color, text_halign, text_valign, text_size, bgcolor', 'Writes and styles one cell in a table.'),
 ...['info','warning','error'].map(name=>fn(`log.${name}`, 'message', `Adds an ${name} message to the script log.`)),
 ...Object.entries({color:['blue','red','green','orange','purple','teal','yellow','white','black','gray','lime','maroon','navy','olive','silver','aqua','fuchsia'],shape:['triangleup','triangledown','circle','cross','xcross','square','diamond','flag','labelup','labeldown','arrowup','arrowdown'],location:['abovebar','belowbar','absolute','top','bottom'],size:['auto','tiny','small','normal','large','huge'],position:['top_left','top_center','top_right','middle_left','middle_center','middle_right','bottom_left','bottom_center','bottom_right'],plot:['style_line','style_linebr','style_stepline','style_histogram','style_columns','style_area','style_areabr','style_circles','style_cross'],strategy:['long','short','fixed','cash','percent_of_equity'],barmerge:['gaps_on','gaps_off','lookahead_on','lookahead_off'],xloc:['bar_index','bar_time'],extend:['none','left','right','both']}).flatMap(([namespace,names])=>names.map(value=>({name:`${namespace}.${value}`,signature:`${namespace}.${value}`,description:`${namespace} constant: ${value.replaceAll('_',' ')}.`,variable:true}))),
 ...Object.entries({open:'Current bar opening price.',high:'Current bar high.',low:'Current bar low.',close:'Current bar closing price.',volume:'Current bar volume.',hl2:'(high + low) / 2.',hlc3:'(high + low + close) / 3.',ohlc4:'(open + high + low + close) / 4.',bar_index:'Zero-based bar number.',time:'Opening timestamp of the current bar in milliseconds.',time_close:'Closing timestamp of the current bar in milliseconds.','syminfo.tickerid':'The current chart instrument identifier.','syminfo.mintick':'Smallest price increment.','timeframe.period':'Current chart timeframe.','barstate.isfirst':'True on the first loaded bar.','barstate.islast':'True on the last loaded bar.','barstate.isconfirmed':'True for a closed bar.','strategy.position_size':'Signed quantity of the current simulated position.','strategy.position_avg_price':'Average entry price of the current simulated position.','strategy.equity':'Current simulated account equity.'}).map(([name,description])=>({name,signature:name,description,variable:true})),
];

/** Finds the innermost call, excluding nested calls, strings, brackets and comments. */
export function pineCallAt(source: string): { name: string; parameter: number } | null {
 const stack: { kind: string; name: string; parameter: number }[] = [];
 let quote = '', comment = false;
 for (let i=0;i<source.length;i++) {
  const c=source[i];
  if(comment){if(c==='\n')comment=false;continue;}
  if(quote){if(c==='\\')i++;else if(c===quote)quote='';continue;}
  if(c==='/'&&source[i+1]==='/'){comment=true;i++;continue;}
  if(c==='"'||c==="'"){quote=c;continue;}
  if(c==='('||c==='['){const name=c==='('?(/([a-zA-Z_][\w.]*)\s*$/.exec(source.slice(0,i))?.[1]??''):'';stack.push({kind:c,name,parameter:0});}
  else if(c===')'||c===']')stack.pop();
  else if(c===','&&stack.length)stack[stack.length-1].parameter++;
 }
 const call=[...stack].reverse().find(entry=>entry.kind==='('&&entry.name);
 return call?{name:call.name,parameter:call.parameter}:null;
}

export function pineErrorLocation(message: string | null | undefined, lineCount: number) {
 const match=message&&/(?:line\s*|:)(\d+)(?::(\d+)|\s*[,;]\s*(?:col(?:umn)?\s*)?(\d+))?/i.exec(message);
 return {line:Math.min(Math.max(1,lineCount),Math.max(1,Number(match?.[1])||1)),column:Math.max(1,Number(match?.[2]??match?.[3])||1)};
}
