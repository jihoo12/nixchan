const aliases = { fishBook:'island-fish', map:'island-map-v2', pebbleMet:'island-pebble', outfit:'nixchan-outfit' };
const key = name => aliases[name] ?? 'island-'+name;
export const loadText = name => globalThis.localStorage?.getItem(key(name));
export const saveText = (name,value) => globalThis.localStorage?.setItem(key(name),value);
export function loadJSON(name) {
 try { return JSON.parse(loadText(name)); } catch { return undefined; }
}
export const saveJSON = (name,data) => saveText(name,JSON.stringify(data));
export const saveAndGo = async () => true;
