const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const axios = require('axios');
const FormData = require('form-data');
const { execSync, exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

const app = express();
const PORT = process.env.PORT || 3000;

// Almacenar información de la última llamada a Control-M para debugging
let lastControlMCall = null;

/**
 * Parsea string en formato "Key=Value, Key2=Value2" (sin llaves) envolviendo en { }.
 * Útil para valores que vienen como "Units=Minutes, Every=0".
 */
function parseKeyValueString(str) {
    if (typeof str !== 'string' || !str.trim()) return null;
    const trimmed = str.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) return javaMapStringToObject(trimmed);
    if (trimmed.includes('=')) return javaMapStringToObject('{' + trimmed + '}');
    return null;
}

/**
 * Convierte string en formato Java/Map (key=value, key2=value2) a objeto JSON.
 * Usado cuando Jira u otras herramientas envían jsonData en ese formato.
 * Los valores pueden contener comas; se detecta el siguiente key= para cortar.
 * @param {string} str - String en formato {key=value, ...}
 * @returns {object|null} Objeto o null si no se pudo convertir
 */
function javaMapStringToObject(str) {
    if (typeof str !== 'string' || !str.trim()) return null;
    str = str.trim();
    if (str[0] !== '{' || str[str.length - 1] !== '}') return null;
    let i = 0;
    const keyChar = /[a-zA-Z0-9_:.-]/;

    function skipWs() {
        while (i < str.length && /[\s\n\r]/.test(str[i])) i++;
    }

    /** Devuelve true si desde i hay ", KeyName=" (siguiente par key=value). */
    function isNextKey() {
        let j = i;
        if (str[j] !== ',') return false;
        j++;
        while (j < str.length && /[\s\n\r]/.test(str[j])) j++;
        if (!keyChar.test(str[j])) return false;
        while (j < str.length && keyChar.test(str[j])) j++;
        return str[j] === '=';
    }

    /** Cierra valor: } ] o equivalentes fullwidth (evita que encoding/copy-paste rompa el parse). */
    const CLOSE_BRACKET = /[}\]\uFF5D\uFF09\uFF3D]/;

    /** Lee un valor string hasta ", KeyName=" o "}" (mismo nivel). No consume la coma. */
    function readStringValue() {
        const start = i;
        let depth = 0;
        while (i < str.length) {
            const c = str[i];
            if (depth === 0) {
                if (CLOSE_BRACKET.test(c)) break;
                if (isNextKey()) break;
            }
            if (c === '{' || c === '[') depth++;
            else if (c === '}' || c === ']') depth--;
            i++;
        }
        return str.substring(start, i).trim();
    }

    function isCloseCurly(pos) {
        return pos < str.length && (str[pos] === '}' || str[pos] === '\uFF5D');
    }

    function peekNextKey() {
        let p = i;
        while (p < str.length && /[\s,]/.test(str[p])) p++;
        if (str.substring(p, p + 7) === 'JobAFT=') return true;
        if (str.substring(p, p + 21) === 'IfBase:Folder:Output_') return true;
        if (str.substring(p, p + 17) === 'eventsToWaitFor=') return true;
        return false;
    }

    function parseObject(depth) {
        if (depth === undefined) depth = 0;
        if (str[i] !== '{') return null;
        i++;
        const obj = {};
        while (true) {
            skipWs();
            if (str[i] === ',') { i++; skipWs(); }
            if (isCloseCurly(i)) {
                i++;
                skipWs();
                if (depth === 1 && str[i] === ',') {
                    i++;
                    continue;
                }
                if (depth === 1 && isCloseCurly(i)) {
                    i++;
                    skipWs();
                    if (str[i] === ',') { i++; skipWs(); }
                    if (peekNextKey()) continue;
                }
                const looksLikeJob = obj.RerunLimit != null && obj.When != null;
                if (looksLikeJob && str[i] === ',') {
                    i++;
                    continue;
                }
                if (looksLikeJob && isCloseCurly(i)) {
                    i++;
                    skipWs();
                    if (str[i] === ',') {
                        i++;
                        continue;
                    }
                    if (peekNextKey()) continue;
                }
                if (depth === 1 && str[i] === ',') {
                    i++;
                    continue;
                }
                if (depth === 1 && isCloseCurly(i)) {
                    i++;
                    skipWs();
                    if (str[i] === ',') {
                        i++;
                        continue;
                    }
                    if (peekNextKey()) continue;
                }
                return obj;
            }
            const keyStart = i;
            while (i < str.length && str[i] !== '=') i++;
            const key = str.substring(keyStart, i).trim();
            if (!key) {
                if (isCloseCurly(i)) i++;
                return obj;
            }
            i++;
            skipWs();
            let value;
            if (str[i] === '{' || str[i] === '\uFF5D') {
                const nextDepth = (key === 'CC1040P2') ? 1 : depth + 1;
                value = parseObject(nextDepth);
            } else if (str[i] === '[' || str[i] === '\uFF3D') {
                value = parseArray();
            } else {
                value = readStringValue();
            }
            obj[key] = value;
            skipWs();
            if (str[i] === ',') i++;
        }
        return obj;
    }

    function parseArray() {
        if (str[i] !== '[') return null;
        i++;
        const arr = [];
        skipWs();
        while (i < str.length && str[i] !== ']') {
            skipWs();
            let value;
            if (str[i] === '{') {
                const objStart = i;
                let depthCurly = 0;
                let j = i;
                while (j < str.length) {
                    const c = str[j];
                    if (c === '{') depthCurly++;
                    else if (c === '}') depthCurly--;
                    j++;
                    if (depthCurly === 0) break;
                }
                const sub = str.substring(objStart, j);
                value = javaMapStringToObject(sub);
                if (value == null) value = parseObject();
                else i = j;
            } else if (str[i] === '[') {
                value = parseArray();
            } else {
                const valStart = i;
                let depth = 0;
                while (i < str.length) {
                    const c = str[i];
                    if (depth === 0 && (c === ',' || c === ']' || c === '\uFF3D')) break;
                    if (c === '[' || c === '{') depth++;
                    else if (c === ']' || c === '}' || c === '\uFF3D') depth--;
                    i++;
                }
                value = str.substring(valStart, i).trim();
                if (typeof value === 'string' && value.includes('], ')) {
                    value = value.split('], ')[0].trim();
                }
            }
            arr.push(value);
            skipWs();
            if (str[i] === ',') i++;
        }
        if (str[i] === ']') i++;
        return arr;
    }

    try {
        return parseObject();
    } catch (e) {
        return null;
    }
}

/**
 * Parsea un string que es un array en formato Java/Map: [{key=val}, {x=y}]
 * o [MON, TUE, WED]. Devuelve array de objetos o strings.
 */
function parseArrayString(str) {
    if (typeof str !== 'string' || !str.trim()) return null;
    str = str.trim();
    if (str[0] !== '[' || str[str.length - 1] !== ']') return null;
    const items = [];
    let i = 1;
    function skipWs() {
        while (i < str.length && /[\s\n\r]/.test(str[i])) i++;
    }
    while (i < str.length && str[i] !== ']') {
        skipWs();
        if (str[i] === '{') {
            let depth = 0;
            const start = i;
            while (i < str.length) {
                if (str[i] === '{') depth++;
                else if (str[i] === '}') depth--;
                i++;
                if (depth === 0) break;
            }
            const sub = str.substring(start, i);
            const parsed = javaMapStringToObject(sub);
            items.push(parsed != null ? parsed : sub);
        } else if (str[i] === '[') {
            let depth = 0;
            const start = i;
            while (i < str.length) {
                if (str[i] === '[') depth++;
                else if (str[i] === ']') depth--;
                i++;
                if (depth === 0) break;
            }
            const sub = str.substring(start, i);
            const arr = parseArrayString(sub);
            items.push(arr != null ? arr : sub);
        } else {
            const start = i;
            while (i < str.length && str[i] !== ',' && str[i] !== ']') i++;
            items.push(str.substring(start, i).trim());
        }
        skipWs();
        if (str[i] === ',') i++;
    }
    return items;
}

/**
 * Convierte recursivamente un objeto que puede tener valores string anidados
 * en formato Java/Map a objetos/arrays reales. Normaliza "true"/"false" a booleanos.
 * Parsea arrays en formato Java/Map cuando JSON.parse falla.
 */
function deepParseJavaMap(obj) {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) {
        return obj.map(item => deepParseJavaMap(item));
    }
    if (typeof obj !== 'object') return obj;
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string') {
            const trimmed = v.trim();
            if (trimmed === 'true') {
                result[k] = true;
            } else if (trimmed === 'false') {
                result[k] = false;
            } else if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                const parsed = javaMapStringToObject(trimmed);
                result[k] = parsed != null ? deepParseJavaMap(parsed) : v;
            } else if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                let arr = null;
                try {
                    arr = JSON.parse(trimmed);
                } catch (_) {
                    arr = parseArrayString(trimmed);
                }
                result[k] = arr != null ? deepParseJavaMap(arr) : v;
            } else if (trimmed.includes('=') && (trimmed.includes(',') || trimmed.includes('{'))) {
                const parsed = parseKeyValueString(trimmed);
                result[k] = parsed != null ? deepParseJavaMap(parsed) : v;
            } else {
                result[k] = v;
            }
        } else {
            result[k] = deepParseJavaMap(v);
        }
    }
    return result;
}

/**
 * Convierte jsonData en formato Java/Map (string sin comillas, key=value) al objeto JSON
 * que se guardará en archivo (formato estándar con comillas dobles al serializar).
 * Usado por /save-json y por /convert-json-data para validar.
 * @param {string} jsonDataString - jsonData en formato "{key=value, ...}" o JSON válido
 * @returns {{ converted: object, jsonString: string, fromJavaMap?: boolean } | { converted: null, error: string }}
 */
function convertJsonDataFromJavaMap(jsonDataString) {
    if (jsonDataString == null || typeof jsonDataString !== 'string') {
        return { converted: null, error: 'jsonData debe ser un string' };
    }
    const trimmed = jsonDataString.trim();
    if (!trimmed) return { converted: null, error: 'jsonData vacío' };
    try {
        try {
            const parsed = JSON.parse(trimmed);
            return { converted: parsed, jsonString: JSON.stringify(parsed, null, 2), fromJavaMap: false };
        } catch (_) {
            const toParse = (trimmed.startsWith('{') && trimmed.endsWith('}')) ? trimmed : ('{' + trimmed + '}');
            const javaMapObj = javaMapStringToObject(toParse);
            if (javaMapObj == null) return { converted: null, error: 'No se pudo convertir formato Java/Map' };
            let converted = deepParseJavaMap(javaMapObj);
            converted = normalizeControlMStructure(converted);
            return { converted, jsonString: JSON.stringify(converted, null, 2), fromJavaMap: true };
        }
    } catch (e) {
        return { converted: null, error: e.message };
    }
}

/** Claves que pertenecen a Mail (no a Variables) al explotar un objeto mal parseado. */
const VARIABLES_MAIL_KEYS = new Set(['Subject', 'To', 'Message', 'AttachOutput']);

/**
 * Normaliza el valor string de una variable (%%SUBSTR %%tm 1 2 → %%tm  1 2, etc.).
 * Quita una llave '}' final si sobró del parseo Java/Map (ej: "%%TIME}" → "%%TIME").
 */
function normalizeVariableValueString(s) {
    if (typeof s !== 'string') return s;
    let out = s.trim();
    if (out.endsWith('}') && !out.includes('{')) out = out.slice(0, -1).trim();
    if (out.includes('%%SUBSTR') && out.includes('%%tm')) {
        out = out.replace(/%%tm\s+(\d+)\s+(\d+)/g, '%%tm  $1 $2');
    }
    return out;
}

/**
 * Acomoda todos los elementos de Variables a la misma estructura: array de objetos
 * con una sola clave y valor string. Filtra elementos inválidos y normaliza valores.
 */
function ensureVariablesStructure(arr) {
    if (!Array.isArray(arr)) return arr;
    const out = [];
    for (const item of arr) {
        if (item === null || item === undefined) continue;
        if (typeof item === 'object' && !Array.isArray(item)) {
            const keys = Object.keys(item).filter(k => !VARIABLES_MAIL_KEYS.has(k));
            for (const key of keys) {
                let val = item[key];
                if (typeof val !== 'string') {
                    val = val === true || val === false ? String(val) : (val != null ? String(val) : '');
                }
                out.push({ [key]: normalizeVariableValueString(val) });
            }
        }
    }
    return out;
}

/**
 * Reconstruye un valor de variable fusionado (ej: "%%TIME}, {HHt=%%SUBSTR ...").
 * keyFirst = clave del primer valor (ej: "tm"). Devuelve array de objetos de una clave o null.
 */
function trySplitMergedVariableValue(keyFirst, val) {
    if (typeof val !== 'string' || !val.includes('}, {')) return null;
    const parts = val.split(/\}\s*,\s*\{/);
    if (parts.length < 2) return null;
    const out = [];
    const firstVal = parts[0].trim();
    if (keyFirst && firstVal) out.push({ [keyFirst]: normalizeVariableValueString(firstVal) });
    for (let i = 1; i < parts.length; i++) {
        const s = parts[i].trim();
        const eq = s.indexOf('=');
        if (eq <= 0) continue;
        const key = s.slice(0, eq).trim();
        const value = s.slice(eq + 1).trim();
        if (key && !VARIABLES_MAIL_KEYS.has(key)) out.push({ [key]: normalizeVariableValueString(value) });
    }
    return out.length ? out : null;
}

/**
 * Convierte Variables a array de objetos de una sola clave [{ "tm": "%%TIME" }, { "HHt": "..." }, ...].
 * - Si es objeto: convierte a array de pares clave-valor.
 * - Si es array con elementos de varias claves (parser fusionó): explota y filtra claves de Mail.
 * - Si un valor parece fusionado (contiene "}, {"), intenta dividirlo y reconstruir.
 * - Al final aplica ensureVariablesStructure para que todos los elementos sigan la misma estructura.
 */
function normalizeVariablesField(value) {
    if (value === null || value === undefined) return value;
    let arr;
    if (Array.isArray(value)) {
        const out = [];
        for (const item of value) {
            if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
                const keys = Object.keys(item);
                if (keys.length <= 1) {
                    out.push(item);
                } else {
                    for (const key of keys) {
                        if (VARIABLES_MAIL_KEYS.has(key)) continue;
                        const val = item[key];
                        const split = trySplitMergedVariableValue(key, val);
                        if (split) {
                            out.push(...split);
                            break;
                        }
                        out.push({ [key]: val });
                    }
                }
            } else {
                out.push(item);
            }
        }
        arr = out.map(item => normalizeControlMStructure(item));
    } else if (typeof value === 'object') {
        arr = Object.entries(value).map(([key, val]) => ({ [key]: val }));
        arr = arr.map(item => normalizeControlMStructure(item));
    } else {
        return value;
    }
    return ensureVariablesStructure(arr);
}

/** Claves que son estructuras anidadas Control-M (pueden venir como string "Key=Value, ..."). */
const CONTROL_M_NESTED_KEYS = new Set([
    'RerunLimit', 'When', 'JobAFT', 'JobAFt', 'eventsToWaitFor',
    'ConfirmationCalendars'
]);

function isControlMNestedKey(key) {
    if (!key || typeof key !== 'string') return false;
    return CONTROL_M_NESTED_KEYS.has(key) ||
        key.startsWith('IfBase:Folder:Output') ||
        key.startsWith('Action:') ||
        /^Mail_\d+$/.test(key);
}

/**
 * Acomoda RerunLimit a { Units: string, Every: string }.
 * Every siempre string; quita llaves/sobrantes si el parseo incluyó "0}}}}".
 */
function ensureRerunLimit(obj) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    const Units = obj.Units != null && typeof obj.Units !== 'object' ? String(obj.Units) : 'Minutes';
    let Every = obj.Every;
    if (Every == null || typeof Every === 'object') Every = '0';
    else {
        Every = String(Every).trim();
        Every = Every.replace(/[}\],\s]+$/, '').trim();
        if (!Every || /[}\]]/.test(Every)) Every = '0';
    }
    return { Units, Every };
}

function toArrayOfStrings(val) {
    if (val == null) return [];
    if (typeof val === 'object' && !Array.isArray(val)) return [];
    if (Array.isArray(val)) return val.map(x => (x != null && typeof x !== 'object' ? String(x).trim() : '')).filter(Boolean);
    let s = String(val).trim();
    if (!s) return [];
    if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1).trim();
    try {
        const parsed = JSON.parse('[' + s + ']');
        return Array.isArray(parsed) ? parsed.map(x => (x != null && typeof x !== 'object' ? String(x).trim() : '')).filter(Boolean) : s.split(',').map(x => x.trim()).filter(Boolean);
    } catch (_) {
        return s.split(',').map(x => x.trim()).filter(Boolean);
    }
}

/**
 * Repara WeekDays cuando el parser metió texto extra en el último elemento (ej: "FRI], MonthDays=...").
 * Devuelve { weekDays: string[], restWhenKeys: object | null }. restWhenKeys tiene MonthDays, FromTime, etc. si se extrajeron.
 */
function repairWeekDaysCorrupted(weekDays) {
    if (!Array.isArray(weekDays) || weekDays.length === 0) return { weekDays, restWhenKeys: null };
    const last = weekDays[weekDays.length - 1];
    if (typeof last !== 'string') return { weekDays, restWhenKeys: null };
    const idx = last.indexOf('], ');
    if (idx === -1) return { weekDays, restWhenKeys: null };
    const goodPart = last.substring(0, idx).trim();
    let rest = last.substring(idx + 3).trim();
    const fixed = weekDays.slice(0, -1).concat(goodPart ? [goodPart] : []);
    const endWhen = rest.search(/\}\s*\},\s*/);
    if (endWhen !== -1) rest = rest.substring(0, endWhen).trim();
    let restWhenKeys = null;
    try {
        const wrapped = (rest.startsWith('{') ? rest : '{' + rest + '}');
        restWhenKeys = javaMapStringToObject(wrapped);
        if (restWhenKeys != null) restWhenKeys = deepParseJavaMap(restWhenKeys);
    } catch (_) {}
    return { weekDays: fixed, restWhenKeys };
}

/**
 * Acomoda When a { WeekDays, MonthDays, FromTime, DaysRelation, ConfirmationCalendars }.
 * Repara WeekDays corruptos (elemento que contiene "], MonthDays=...") extrayendo solo los días y parseando el resto.
 */
function ensureWhen(obj) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    const result = {};
    let weekDaysRaw = obj.WeekDays;
    if (Array.isArray(weekDaysRaw)) {
        const repaired = repairWeekDaysCorrupted(weekDaysRaw);
        result.WeekDays = toArrayOfStrings(repaired.weekDays);
        if (repaired.restWhenKeys && typeof repaired.restWhenKeys === 'object') {
            if (repaired.restWhenKeys.WeekDays != null) result.WeekDays = toArrayOfStrings(repaired.restWhenKeys.WeekDays);
            if (repaired.restWhenKeys.MonthDays != null) result.MonthDays = toArrayOfStrings(repaired.restWhenKeys.MonthDays);
            if (repaired.restWhenKeys.FromTime != null) result.FromTime = String(repaired.restWhenKeys.FromTime);
            if (repaired.restWhenKeys.DaysRelation != null) result.DaysRelation = String(repaired.restWhenKeys.DaysRelation);
            if (repaired.restWhenKeys.ConfirmationCalendars != null) result.ConfirmationCalendars = normalizeControlMStructure(repaired.restWhenKeys.ConfirmationCalendars);
        }
    } else {
        result.WeekDays = toArrayOfStrings(weekDaysRaw);
    }
    if (result.WeekDays.length === 0) result.WeekDays = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
    result.MonthDays = result.MonthDays != null ? result.MonthDays : toArrayOfStrings(obj.MonthDays);
    if (result.MonthDays.length === 0) result.MonthDays = ['NONE'];
    result.FromTime = (result.FromTime != null ? result.FromTime : (obj.FromTime != null && typeof obj.FromTime !== 'object') ? String(obj.FromTime) : '2000');
    result.DaysRelation = (result.DaysRelation != null ? result.DaysRelation : (obj.DaysRelation != null && typeof obj.DaysRelation !== 'object') ? String(obj.DaysRelation) : 'OR');
    if (result.ConfirmationCalendars == null) {
        if (obj.ConfirmationCalendars != null && typeof obj.ConfirmationCalendars === 'object' && !Array.isArray(obj.ConfirmationCalendars)) {
            result.ConfirmationCalendars = normalizeControlMStructure(obj.ConfirmationCalendars);
        } else if (obj.ConfirmationCalendars != null) {
            result.ConfirmationCalendars = { Calendar: String(obj.ConfirmationCalendars) };
        } else {
            result.ConfirmationCalendars = { Calendar: 'Cal_Habil' };
        }
    }
    return result;
}

/**
 * Acomoda JobAFT a { Type: string, Quantity: string } (Quantity como string para JSON Control-M).
 * Evita "[object Object]" si Quantity viene como objeto.
 */
function ensureJobAFT(obj) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    const Type = obj.Type != null && typeof obj.Type !== 'object' ? String(obj.Type) : 'Resource:Pool';
    let Quantity = obj.Quantity;
    if (Quantity == null || typeof Quantity === 'object') Quantity = '1';
    else Quantity = String(Quantity);
    return { Type, Quantity };
}

/**
 * Acomoda eventsToWaitFor a { Type: "WaitForEvents", Events: [ { Event: string } ] }.
 */
function ensureEventsToWaitFor(obj) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    const Type = obj.Type != null ? String(obj.Type) : 'WaitForEvents';
    let Events = obj.Events;
    if (!Array.isArray(Events)) {
        Events = (Events != null ? [Events] : []);
    }
    Events = Events.map(e => {
        if (e != null && typeof e === 'object' && e.Event != null) return { Event: String(e.Event) };
        if (typeof e === 'string') return { Event: e };
        return { Event: String(e) };
    });
    return { Type, Events };
}

/**
 * Convierte AttachOutput a boolean donde corresponda.
 */
function ensureAttachOutput(value) {
    if (value === true || value === false) return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return false;
}

/**
 * Normaliza el objeto para que coincida con la estructura esperada por Control-M:
 * - Variables: siempre array de objetos de una clave.
 * - RerunLimit, When, JobAFT, eventsToWaitFor: estructuras bien formadas.
 * - Message/Subject: escapes \\n\\n para Atte./Operador.
 * - Valores string que parecen "Key=Value, ...": se parsean y normalizan.
 */
function normalizeControlMStructure(obj) {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) {
        return obj.map(item => normalizeControlMStructure(item));
    }
    if (typeof obj !== 'object') return obj;
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
        if (k === 'Variables') {
            result[k] = normalizeVariablesField(v);
            continue;
        }
        if (k === 'RerunLimit' || k === 'RerunLiimit') {
            let val = v;
            if (typeof val === 'string') val = parseKeyValueString(val) || val;
            result[k === 'RerunLiimit' ? 'RerunLimit' : k] = ensureRerunLimit(normalizeControlMStructure(val));
            continue;
        }
        if (k === 'When') {
            let val = v;
            if (typeof val === 'string') val = parseKeyValueString(val) || val;
            result[k] = ensureWhen(normalizeControlMStructure(val));
            continue;
        }
        if (k === 'JobAFT' || k === 'JobAFt') {
            let val = v;
            if (typeof val === 'string') val = parseKeyValueString(val) || val;
            result['JobAFT'] = ensureJobAFT(normalizeControlMStructure(val));
            continue;
        }
        if (k === 'eventsToWaitFor') {
            let val = v;
            if (typeof val === 'string') val = parseKeyValueString(val) || val;
            result[k] = ensureEventsToWaitFor(normalizeControlMStructure(val));
            continue;
        }
        if (typeof v === 'string') {
            if (isControlMNestedKey(k)) {
                const parsed = parseKeyValueString(v);
                if (parsed != null) {
                    result[k] = normalizeControlMStructure(parsed);
                    continue;
                }
            }
            let s = v;
            if (k === 'Message' || (k === 'Subject' && s.includes('%%'))) {
                // Usar secuencia literal \n (barra+n) en el JSON; Control-M rechaza el carácter newline real (control character)
                s = s.replace(/\s+%%HORA\s+Atte\./g, ' %%HORA\\nAtte.');
                s = s.replace(/\s+Atte\.\s+Operador/g, 'Atte.\\n\\nOperador ');
            }
            if (s.includes('%%SUBSTR') && s.includes('%%tm')) {
                s = s.replace(/%%tm\s+(\d+)\s+(\d+)/g, '%%tm  $1 $2');
            }
            if (k === 'AttachOutput') {
                result[k] = ensureAttachOutput(s);
            } else {
                result[k] = s;
            }
        } else {
            let normalized = normalizeControlMStructure(v);
            if (k === 'AttachOutput') normalized = ensureAttachOutput(normalized);
            result[k] = normalized;
        }
    }
    return result;
}

// Middleware
app.use(cors());

// Middleware para capturar y limpiar body SOLO para /save-json
app.use('/save-json', (req, res, next) => {
    let data = '';
    
    req.on('data', chunk => {
        data += chunk.toString('utf8');
    });
    
    req.on('end', () => {
        try {
            console.log('[RAW-BODY] ========================================');
            console.log('[RAW-BODY] Body recibido, longitud:', data.length);
            console.log('[RAW-BODY] Primeros 500 chars:', data.substring(0, 500));
            
            // Limpiar el JSON: el problema es '\'' que debe ser '
            let cleanedBody = data;
            
            // Reemplazar comillas simples escapadas problemáticas
            // Patrón: '\'' dentro de strings JSON
            cleanedBody = cleanedBody.replace(/\\'\\'\\'/g, "'");
            cleanedBody = cleanedBody.replace(/\\'\\'/g, "'");
            cleanedBody = cleanedBody.replace(/\\'/g, "'");
            
            // Quitar caracteres de control (newline, tab, etc.) que rompen el parse cuando
            // vienen desde Jira u otras herramientas que insertan saltos de línea en strings
            cleanedBody = cleanedBody.replace(/[\x00-\x1f]/g, ' ');
            
            console.log('[RAW-BODY] Body limpiado, longitud:', cleanedBody.length);
            console.log('[RAW-BODY] Intentando parsear...');
            
            // Parsear JSON
            try {
                req.body = JSON.parse(cleanedBody);
                console.log('[RAW-BODY] ✅ JSON parseado exitosamente');
                console.log('[RAW-BODY] Keys:', Object.keys(req.body));
                next();
            } catch (parseError) {
                console.error('[RAW-BODY] ❌ ERROR parseando:', parseError.message);
                const pos = parseError.message.match(/position (\d+)/)?.[1];
                if (pos) {
                    const start = Math.max(0, parseInt(pos) - 100);
                    const end = Math.min(cleanedBody.length, parseInt(pos) + 100);
                    console.error('[RAW-BODY] Contexto:', cleanedBody.substring(start, end));
                }
                
                // Guardar para debug
                const debugFile = path.join(os.tmpdir(), 'debug-' + Date.now() + '.txt');
                fs.writeFileSync(debugFile, cleanedBody);
                console.error('[RAW-BODY] Guardado en:', debugFile);
                
                return res.status(400).json({
                    success: false,
                    error: 'Error parseando JSON',
                    details: parseError.message,
                    debugFile: debugFile
                });
            }
        } catch (error) {
            console.error('[RAW-BODY] ERROR:', error.message);
            return res.status(500).json({
                success: false,
                error: 'Error procesando body',
                details: error.message
            });
        }
    });
});

// Middleware normal para otros endpoints (no leer body en POST /save-json: ya lo leyó el middleware anterior)
app.use((req, res, next) => {
    if (req.path === '/save-json' && req.method === 'POST') {
        return next(); // body ya consumido por el middleware de /save-json
    }
    return express.json({ limit: '50mb', strict: false })(req, res, next);
});
app.use((req, res, next) => {
    if (req.path === '/save-json' && req.method === 'POST') {
        return next();
    }
    return express.urlencoded({ extended: true, limit: '50mb' })(req, res, next);
});

// Middleware para capturar errores de parsing JSON
app.use((error, req, res, next) => {
    if (error instanceof SyntaxError || error.message.includes('JSON')) {
        console.error('========================================');
        console.error('ERROR DE PARSING JSON');
        console.error('Mensaje:', error.message);
        console.error('Stack:', error.stack);
        console.error('========================================');
        
        return res.status(400).json({
            success: false,
            error: 'Error al parsear el JSON del body',
            details: error.message,
            hint: 'Verifica que el JSON esté correctamente formateado.'
        });
    }
    next(error);
});

// Función para obtener el usuario de la sesión actual
function getCurrentUser() {
    try {
        let user = null;
        
        // En Windows, probar diferentes métodos para obtener usuario de sesión activa
        if (process.platform === 'win32') {
            try {
                // Método 1: whoami (más confiable para sesión activa)
                user = execSync('whoami', { encoding: 'utf8' }).trim();
                console.log(`Usuario detectado con whoami: ${user}`);
                
                // Limpiar el formato de dominio si existe (ej: DOMAIN\user -> user)
                if (user.includes('\\')) {
                    user = user.split('\\').pop();
                    console.log(`Usuario limpio (sin dominio): ${user}`);
                }
            } catch (error) {
                console.log('whoami falló, probando otros métodos...');
            }
            
            // Método 2: query session (para obtener sesión activa)
            if (!user) {
                try {
                    const sessionInfo = execSync('query session', { encoding: 'utf8' });
                    console.log('Información de sesiones:', sessionInfo);
                    
                    // Buscar la sesión activa (estado "Active")
                    const lines = sessionInfo.split('\n');
                    for (const line of lines) {
                        if (line.includes('Active') && line.includes('console')) {
                            const parts = line.trim().split(/\s+/);
                            if (parts.length >= 2) {
                                user = parts[1];
                                console.log(`Usuario de sesión activa detectado: ${user}`);
                                break;
                            }
                        }
                    }
                } catch (error) {
                    console.log('query session falló...');
                }
            }
            
            // Método 3: echo %USERNAME% (variable de entorno)
            if (!user) {
                try {
                    user = execSync('echo %USERNAME%', { encoding: 'utf8', shell: true }).trim();
                    console.log(`Usuario detectado con echo %USERNAME%: ${user}`);
                } catch (error) {
                    console.log('echo %USERNAME% falló...');
                }
            }
            
            // Método 4: Usar variables de entorno directamente
            if (!user) {
                user = process.env.USERNAME || process.env.USER;
                console.log(`Usuario detectado con variables de entorno: ${user}`);
            }
            
            // Método 5: Usar wmic para obtener usuario de sesión
            if (!user) {
                try {
                    const wmicResult = execSync('wmic computersystem get username /value', { encoding: 'utf8' });
                    const match = wmicResult.match(/Username=(.+)/);
                    if (match) {
                        user = match[1].trim();
                        console.log(`Usuario detectado con wmic: ${user}`);
                    }
                } catch (error) {
                    console.log('wmic falló...');
                }
            }
        } else {
            // En sistemas Unix-like
            try {
                user = execSync('who am i', { encoding: 'utf8' }).split(' ')[0];
                console.log(`Usuario detectado con 'who am i': ${user}`);
            } catch (error) {
                console.log('who am i falló, probando otros métodos...');
                user = execSync('whoami', { encoding: 'utf8' }).trim();
                console.log(`Usuario detectado con whoami: ${user}`);
            }
        }
        
        // Fallback final
        if (!user) {
            user = os.userInfo().username;
            console.log(`Usuario de fallback (os.userInfo): ${user}`);
        }
        
        console.log(`Usuario final seleccionado: ${user}`);
        return user;
        
    } catch (error) {
        console.warn('Error obteniendo usuario de la sesión:', error.message);
        const fallbackUser = os.userInfo().username;
        console.log(`Usuario de fallback por error: ${fallbackUser}`);
        return fallbackUser;
    }
}

// Función para obtener la ruta de Documentos del usuario de sesión actual
function getDocumentsPath() {
    try {
        const currentUser = getCurrentUser();
        console.log(`Intentando obtener Documentos para usuario: ${currentUser}`);
        
        let documentsPath = null;
        
        // En Windows, probar diferentes rutas
        if (process.platform === 'win32') {
            // Método 1: Ruta OneDrive Documentos (preferida)
            const oneDrivePath = path.join('C:', 'Users', currentUser, 'OneDrive', 'Documentos');
            console.log(`Probando ruta OneDrive Documentos: ${oneDrivePath}`);
            
            if (fs.existsSync(oneDrivePath)) {
                documentsPath = oneDrivePath;
                console.log(`Ruta OneDrive Documentos encontrada: ${documentsPath}`);
            } else {
                console.log('Ruta OneDrive Documentos no existe, probando otras opciones...');
                
                // Método 2: Ruta estándar C:\Users\[usuario]\Documents
                const standardPath = path.join('C:', 'Users', currentUser, 'Documents');
                console.log(`Probando ruta estándar: ${standardPath}`);
                
                if (fs.existsSync(standardPath)) {
                    documentsPath = standardPath;
                    console.log(`Ruta estándar encontrada: ${documentsPath}`);
                } else {
                    console.log('Ruta estándar no existe, probando otras opciones...');
                    
                    // Método 3: Usar variable de entorno USERPROFILE
                    const userProfile = process.env.USERPROFILE;
                    if (userProfile) {
                        const envPath = path.join(userProfile, 'Documents');
                        console.log(`Probando ruta con USERPROFILE: ${envPath}`);
                        if (fs.existsSync(envPath)) {
                            documentsPath = envPath;
                            console.log(`Ruta con USERPROFILE encontrada: ${documentsPath}`);
                        }
                    }
                    
                    // Método 4: Usar HOMEDRIVE y HOMEPATH
                    if (!documentsPath) {
                        const homeDrive = process.env.HOMEDRIVE;
                        const homePath = process.env.HOMEPATH;
                        if (homeDrive && homePath) {
                            const envPath = path.join(homeDrive, homePath, 'Documents');
                            console.log(`Probando ruta con HOMEDRIVE/HOMEPATH: ${envPath}`);
                            if (fs.existsSync(envPath)) {
                                documentsPath = envPath;
                                console.log(`Ruta con HOMEDRIVE/HOMEPATH encontrada: ${documentsPath}`);
                            }
                        }
                    }
                }
            }
        } else {
            // En sistemas Unix-like
            const unixPath = path.join('/home', currentUser, 'Documents');
            console.log(`Probando ruta Unix: ${unixPath}`);
            
            if (fs.existsSync(unixPath)) {
                documentsPath = unixPath;
                console.log(`Ruta Unix encontrada: ${documentsPath}`);
            } else {
                // Probar con HOME
                const homeDir = process.env.HOME;
                if (homeDir) {
                    const homePath = path.join(homeDir, 'Documents');
                    console.log(`Probando ruta con HOME: ${homePath}`);
                    if (fs.existsSync(homePath)) {
                        documentsPath = homePath;
                        console.log(`Ruta con HOME encontrada: ${documentsPath}`);
                    }
                }
            }
        }
        
        // Fallback final
        if (!documentsPath) {
            documentsPath = path.join(os.homedir(), 'Documents');
            console.log(`Usando fallback: ${documentsPath}`);
        }
        
        console.log(`Ruta final de Documentos: ${documentsPath}`);
        return documentsPath;
        
    } catch (error) {
        console.warn('Error obteniendo ruta de Documentos:', error.message);
        const fallbackPath = path.join(os.homedir(), 'Documents');
        console.log(`Ruta de fallback por error: ${fallbackPath}`);
        return fallbackPath;
    }
}

// Función para obtener la ruta del Escritorio del usuario de sesión actual
function getDesktopPath() {
    try {
        const currentUser = getCurrentUser();
        console.log(`Intentando obtener Escritorio para usuario: ${currentUser}`);
        
        let desktopPath = null;
        
        // En Windows, probar diferentes rutas
        if (process.platform === 'win32') {
            // Método 1: Ruta OneDrive Escritorio (preferida)
            const oneDrivePath = path.join('C:', 'Users', currentUser, 'OneDrive', 'Escritorio');
            console.log(`Probando ruta OneDrive Escritorio: ${oneDrivePath}`);
            
            if (fs.existsSync(oneDrivePath)) {
                desktopPath = oneDrivePath;
                console.log(`Ruta OneDrive Escritorio encontrada: ${desktopPath}`);
            } else {
                console.log('Ruta OneDrive Escritorio no existe, probando otras opciones...');
                
                // Método 2: Ruta estándar C:\Users\[usuario]\Desktop
                const standardPath = path.join('C:', 'Users', currentUser, 'Desktop');
                console.log(`Probando ruta estándar: ${standardPath}`);
                
                if (fs.existsSync(standardPath)) {
                    desktopPath = standardPath;
                    console.log(`Ruta estándar encontrada: ${desktopPath}`);
                } else {
                    console.log('Ruta estándar no existe, probando otras opciones...');
                    
                    // Método 3: Usar variable de entorno USERPROFILE
                    const userProfile = process.env.USERPROFILE;
                    if (userProfile) {
                        const envPath = path.join(userProfile, 'Desktop');
                        console.log(`Probando ruta con USERPROFILE: ${envPath}`);
                        if (fs.existsSync(envPath)) {
                            desktopPath = envPath;
                            console.log(`Ruta con USERPROFILE encontrada: ${desktopPath}`);
                        }
                    }
                    
                    // Método 4: Usar HOMEDRIVE y HOMEPATH
                    if (!desktopPath) {
                        const homeDrive = process.env.HOMEDRIVE;
                        const homePath = process.env.HOMEPATH;
                        if (homeDrive && homePath) {
                            const envPath = path.join(homeDrive, homePath, 'Desktop');
                            console.log(`Probando ruta con HOMEDRIVE/HOMEPATH: ${envPath}`);
                            if (fs.existsSync(envPath)) {
                                desktopPath = envPath;
                                console.log(`Ruta con HOMEDRIVE/HOMEPATH encontrada: ${desktopPath}`);
                            }
                        }
                    }
                }
            }
        } else {
            // En sistemas Unix-like
            const unixPath = path.join('/home', currentUser, 'Desktop');
            console.log(`Probando ruta Unix: ${unixPath}`);
            
            if (fs.existsSync(unixPath)) {
                desktopPath = unixPath;
                console.log(`Ruta Unix encontrada: ${desktopPath}`);
            } else {
                // Probar con HOME
                const homeDir = process.env.HOME;
                if (homeDir) {
                    const homePath = path.join(homeDir, 'Desktop');
                    console.log(`Probando ruta con HOME: ${homePath}`);
                    if (fs.existsSync(homePath)) {
                        desktopPath = homePath;
                        console.log(`Ruta con HOME encontrada: ${desktopPath}`);
                    }
                }
            }
        }
        
        // Fallback final
        if (!desktopPath) {
            desktopPath = path.join(os.homedir(), 'Desktop');
            console.log(`Usando fallback: ${desktopPath}`);
        }
        
        console.log(`Ruta final del Escritorio: ${desktopPath}`);
        return desktopPath;
        
    } catch (error) {
        console.warn('Error obteniendo ruta del Escritorio:', error.message);
        const fallbackPath = path.join(os.homedir(), 'Desktop');
        console.log(`Ruta de fallback por error: ${fallbackPath}`);
        return fallbackPath;
    }
}

// Función para crear directorio si no existe
function ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`Directorio creado: ${dirPath}`);
    }
}

// Función para sanitizar y normalizar el nombre de archivo
function sanitizeFilename(filename) {
    if (!filename || typeof filename !== 'string') {
        throw new Error('El filename debe ser una cadena de texto válida');
    }
    
    // Sanitizar el nombre del archivo (eliminar caracteres peligrosos)
    let sanitized = filename
        .replace(/[^a-zA-Z0-9._-]/g, '_')  // Reemplazar caracteres especiales
        .replace(/_{2,}/g, '_')            // Reemplazar múltiples guiones bajos
        .replace(/^_+|_+$/g, '')          // Eliminar guiones bajos al inicio/final
        .trim();
    
    // Si después de sanitizar está vacío, usar un nombre por defecto
    if (!sanitized) {
        sanitized = 'archivo';
    }
    
    // Asegurar que tenga extensión .json
    if (!sanitized.endsWith('.json')) {
        sanitized = `${sanitized}.json`;
    }
    
    return sanitized;
}

// Función para obtener la ruta de almacenamiento en EC2 - VERSIÓN SIMPLIFICADA Y ROBUSTA
function getStoragePath() {
    const homeDir = os.homedir();
    if (!homeDir) {
        throw new Error('No se pudo detectar el directorio home');
    }
    
    const desktopPath = path.join(homeDir, 'Desktop');
    const storagePath = path.join(desktopPath, 'jsonControlm');
    
    // Crear carpetas de forma forzada - SIEMPRE
    try {
        fs.mkdirSync(desktopPath, { recursive: true, mode: 0o755 });
    } catch (e) {
        // Ignorar si ya existe
    }
    
    try {
        fs.mkdirSync(storagePath, { recursive: true, mode: 0o755 });
    } catch (e) {
        // Ignorar si ya existe
    }
    
    return storagePath;
}

// Función para generar script automático de guardado
function generateAutoSaveScript(jsonData, filename, ambiente, token) {
    const script = `
// Script automático generado por la API
// Este script guardará el archivo JSON en tu computadora local

const fs = require('fs');
const path = require('path');
const os = require('os');

async function guardarArchivoAutomaticamente() {
    try {
        console.log('=== GUARDANDO ARCHIVO AUTOMÁTICAMENTE ===');
        
        // Datos del archivo JSON
        const jsonData = ${JSON.stringify(jsonData, null, 8)};
        const filename = '${filename}';
        const ambiente = '${ambiente}';
        const token = '${token}';
        
        // Detectar ruta del Escritorio en esta computadora
        const oneDrivePath = path.join(os.homedir(), 'OneDrive', 'Escritorio');
        const systemPath = path.join(os.homedir(), 'Desktop');
        
        let desktopPath;
        if (fs.existsSync(oneDrivePath)) {
            desktopPath = oneDrivePath;
            console.log('📁 Usando OneDrive Escritorio');
        } else {
            desktopPath = systemPath;
            console.log('📁 Usando Desktop del sistema');
        }
        
        const storagePath = path.join(desktopPath, 'jsonControlm');
        
        console.log(\`Ruta del Escritorio: \${desktopPath}\`);
        console.log(\`Ruta de almacenamiento: \${storagePath}\`);
        
        // Crear carpeta jsonControlm si no existe
        if (!fs.existsSync(storagePath)) {
            fs.mkdirSync(storagePath, { recursive: true });
            console.log(\`✅ Carpeta jsonControlm creada: \${storagePath}\`);
        } else {
            console.log(\`ℹ️ Carpeta jsonControlm ya existe: \${storagePath}\`);
        }
        
        // Ruta completa del archivo
        const filePath = path.join(storagePath, filename);
        
        // Guardar el archivo JSON
        fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2));
        console.log(\`✅ Archivo JSON guardado: \${filePath}\`);
        
        // Verificar que se guardó
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            console.log(\`📁 Tamaño: \${stats.size} bytes\`);
            console.log(\`📅 Creado: \${stats.birthtime}\`);
        }
        
        console.log('\\n🎉 ¡ARCHIVO GUARDADO EXITOSAMENTE!');
        console.log(\`📂 Ubicación: \${filePath}\`);
        console.log('\\n📋 Información del archivo:');
        console.log(\`- Nombre: \${filename}\`);
        console.log(\`- Ambiente: \${ambiente}\`);
        console.log(\`- Token: \${token}\`);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.log('\\n🔧 Posibles soluciones:');
        console.log('1. Verifica que tengas permisos de escritura en el Escritorio');
        console.log('2. Ejecuta como administrador si es necesario');
        console.log('3. Verifica que Node.js esté instalado');
    }
}

// Ejecutar automáticamente
guardarArchivoAutomaticamente();
`;
    
    return script;
}

// Función para ejecutar la API de Control-M
// Ahora lee el archivo desde la ruta de almacenamiento en EC2
async function executeControlMApi(controlmApiUrl, token, filePath) {
    try {
        filePath = path.resolve(filePath);
        const fileName = path.basename(filePath);
        const fileStats = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
        
        lastControlMCall = {
            timestamp: new Date().toISOString(),
            url: controlmApiUrl,
            token: token ? `${token.substring(0, 20)}...${token.substring(token.length - 10)}` : 'NO',
            filePath: filePath,
            fileName: fileName,
            fileSize: fileStats ? fileStats.size : 0,
            fileExists: fs.existsSync(filePath),
            status: 'in_progress'
        };
        
        console.log(`[CONTROL-M] ========================================`);
        console.log(`[CONTROL-M] Ejecutando API de Control-M`);
        console.log(`[CONTROL-M] URL: ${controlmApiUrl}`);
        console.log(`[CONTROL-M] Archivo: ${filePath}`);
        console.log(`[CONTROL-M] Token: ${token ? token.substring(0, 20) + '...' : 'NO'}`);
        
        // Verificar que el archivo existe
        if (!fs.existsSync(filePath)) {
            lastControlMCall.status = 'error';
            lastControlMCall.error = `El archivo no existe en la ruta: ${filePath}`;
            throw new Error(`El archivo no existe en la ruta: ${filePath}`);
        }
        
        console.log(`[CONTROL-M] Archivo verificado que existe`);
        
        // Leer el archivo desde el sistema de archivos
        console.log(`[CONTROL-M] Leyendo archivo desde: ${filePath}`);
        const fileStream = fs.createReadStream(filePath);
        
        // Crear form-data con el stream del archivo
        console.log(`[CONTROL-M] Creando form-data...`);
        const form = new FormData();
        form.append('definitionsFile', fileStream, {
            filename: fileName,
            contentType: 'application/json'
        });

        // Configurar headers con Bearer token
        console.log(`[CONTROL-M] Configurando headers...`);
        const headers = {
            ...form.getHeaders(),
            'Authorization': `Bearer ${token}`
        };
        
        // Log REQUEST completo para EC2
        const requestLog = {
            url: controlmApiUrl,
            method: 'POST',
            headers: {
                'Content-Type': headers['content-type'],
                'Authorization': `Bearer ${token.substring(0, 20)}...${token.substring(token.length - 10)}`
            },
            formData: { field: 'definitionsFile', filename: fileName, contentType: 'application/json', filePath }
        };
        console.log(`[CONTROL-M] ========== REQUEST ==========`);
        console.log(`[CONTROL-M] REQUEST:`, JSON.stringify(requestLog, null, 2));
        console.log(`[CONTROL-M] =============================`);
        
        const config = {
            headers: headers,
            timeout: 60000, // 60 segundos timeout (aumentado para archivos grandes)
            // Deshabilitar verificación SSL para IPs privadas o certificados autofirmados
            httpsAgent: new https.Agent({
                rejectUnauthorized: false
            }),
            // Configuración adicional para axios
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        };

        // Realizar la petición POST
        console.log(`[CONTROL-M] 🚀 Enviando petición POST a Control-M...`);
        console.log(`[CONTROL-M] Configuración SSL: rejectUnauthorized=false (para IPs privadas)`);
        const startTime = Date.now();
        const response = await axios.post(controlmApiUrl, form, config);
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        const responseBodyStr = JSON.stringify(response.data, null, 2);
        const maxLogLen = 5000;
        const responseBodyLog = responseBodyStr.length <= maxLogLen ? responseBodyStr : responseBodyStr.substring(0, maxLogLen) + '\n... (truncado, total ' + responseBodyStr.length + ' chars)';
        console.log(`[CONTROL-M] ========== RESPONSE ==========`);
        console.log(`[CONTROL-M] RESPONSE status: ${response.status} ${response.statusText || ''} (${duration}ms)`);
        console.log(`[CONTROL-M] RESPONSE headers:`, JSON.stringify(response.headers));
        console.log(`[CONTROL-M] RESPONSE body:\n${responseBodyLog}`);
        console.log(`[CONTROL-M] ==============================`);
        
        return {
            success: true,
            status: response.status,
            data: response.data,
            filePath: filePath,
            message: `API de Control-M ejecutada exitosamente`
        };

    } catch (error) {
        // Actualizar información del error
        if (lastControlMCall) {
            lastControlMCall.status = 'error';
            lastControlMCall.error = {
                message: error.message,
                status: error.response?.status || 'N/A',
                statusText: error.response?.statusText || 'N/A',
                data: error.response?.data || null,
                requestConfig: error.config ? {
                    url: error.config.url,
                    method: error.config.method,
                    headers: error.config.headers ? Object.keys(error.config.headers) : 'N/A'
                } : null
            };
        }
        
        console.error(`[CONTROL-M] ========== ERROR ==========`);
        console.error(`[CONTROL-M] REQUEST (que falló): URL=${controlmApiUrl} method=POST filePath=${filePath}`);
        console.error(`[CONTROL-M] ERROR mensaje: ${error.message}`);
        if (error.response) {
            console.error(`[CONTROL-M] RESPONSE (error) status: ${error.response.status} ${error.response.statusText || ''}`);
            console.error(`[CONTROL-M] RESPONSE (error) headers:`, JSON.stringify(error.response.headers));
            console.error(`[CONTROL-M] RESPONSE (error) body:`, JSON.stringify(error.response.data, null, 2));
        } else if (error.request) {
            console.error(`[CONTROL-M] RESPONSE: no se recibió respuesta del servidor`);
        } else {
            console.error(`[CONTROL-M] Error de configuración:`, error.message);
        }
        console.error(`[CONTROL-M] ===========================`);
        
        return {
            success: false,
            error: error.message,
            status: error.response?.status || 'N/A',
            statusText: error.response?.statusText || 'N/A',
            data: error.response?.data || null,
            message: `Error ejecutando API de Control-M`
        };
    }
}

// Versión del handler /save-json (para confirmar en EC2 que corre la versión con Control-M + script)
const SAVE_JSON_HANDLER_VERSION = '2025-01-with-controlm-and-script';

// Endpoint para guardar archivo JSON en EC2 - VERSIÓN DEFINITIVA Y ROBUSTA
app.post('/save-json', async (req, res) => {
    console.log('\n========================================');
    console.log('=== INICIO POST /save-json ===');
    console.log('[VERSION]', SAVE_JSON_HANDLER_VERSION);
    console.log('Timestamp:', new Date().toISOString());
    console.log('========================================\n');
    
    try {
        // 1. Logging inicial del request
        console.log('[1] Request recibido');
        console.log('[1] Body keys:', Object.keys(req.body));
        console.log('[1] Content-Type:', req.headers['content-type']);
        console.log('[1] Content-Length:', req.headers['content-length']);
        
        // 1.5 Guardar el request SIEMPRE (incluso si falla después), en la misma ruta donde se guardan los JSON
        const requestStoragePath = path.resolve(__dirname, 'jsonControlm');
        const requestTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const requestCapturePath = path.join(requestStoragePath, 'request-' + requestTimestamp + '.json');
        try {
            fs.mkdirSync(requestStoragePath, { recursive: true });
            const bodyToSave = { ...req.body };
            if (bodyToSave.token && typeof bodyToSave.token === 'string') {
                bodyToSave.token = bodyToSave.token.substring(0, 8) + '...' + bodyToSave.token.substring(bodyToSave.token.length - 4);
            }
            bodyToSave._capturedAt = new Date().toISOString();
            fs.writeFileSync(requestCapturePath, JSON.stringify(bodyToSave, null, 2), 'utf8');
            console.log('[1.5] ✅ Request guardado (siempre):', requestCapturePath);
        } catch (requestErr) {
            console.error('[1.5] ⚠️ No se pudo guardar el request:', requestErr.message);
        }
        
        // 2. Validaciones básicas (trim para valores enviados desde Jira u otros con espacios)
        let { ambiente, token, filename, jsonData, controlm_api, script_path, returnJsonDataBeforeSave } = req.body;
        ambiente = ambiente != null ? String(ambiente).trim() : '';
        token = token != null ? String(token).trim() : '';
        filename = filename != null ? String(filename).trim() : '';
        controlm_api = controlm_api != null ? String(controlm_api).trim() : '';
        script_path = script_path != null ? String(script_path).trim() : '';
        const wantJsonDataInResponse = returnJsonDataBeforeSave === true || returnJsonDataBeforeSave === 'true';
        console.log('[2] Datos extraídos:', {
            ambiente: ambiente,
            token: token ? token.substring(0, 10) + '...' : 'NO',
            filename: filename,
            hasJsonData: !!jsonData,
            jsonDataType: typeof jsonData,
            controlm_api: controlm_api || 'NO (opcional)',
            script_path: script_path || 'NO (opcional)',
            returnJsonDataBeforeSave: wantJsonDataInResponse
        });
        
        if (!ambiente || !token || !filename || !jsonData) {
            console.error('[2] ❌ ERROR: Faltan campos requeridos');
            return res.status(400).json({
                success: false,
                error: 'Se requieren los campos "ambiente", "token", "filename" y "jsonData"',
                received: {
                    ambiente: !!ambiente,
                    token: !!token,
                    filename: !!filename,
                    jsonData: !!jsonData
                }
            });
        }
        
        // controlm_api es opcional - si no se proporciona, no se ejecutará Control-M
        if (controlm_api && !controlm_api.startsWith('http')) {
            console.error('[2] ❌ ERROR: controlm_api debe ser una URL válida');
            return res.status(400).json({
                success: false,
                error: 'El campo "controlm_api" debe ser una URL válida (ej: https://controlms1de01:8446/automation-api/deploy)'
            });
        }
        
        const ambienteNorm = ambiente.toUpperCase();
        if (!['DEV', 'QA'].includes(ambienteNorm)) {
            console.error('[2] ❌ ERROR: Ambiente inválido:', ambiente);
            return res.status(400).json({
                success: false,
                error: 'El campo "ambiente" solo puede tener los valores "DEV" o "QA"'
            });
        }

        // 2.5 Valor de jsonData ANTES de crear el archivo (para inspección / debug)
        let jsonDataBeforeSave = null;
        if (typeof jsonData === 'string') {
            const len = jsonData.length;
            const sample = len <= 1200 ? jsonData : jsonData.substring(0, 800) + '\n... [truncado, total ' + len + ' caracteres] ...\n' + jsonData.substring(len - 400);
            console.log('[2.5] jsonData (string) longitud:', len);
            console.log('[2.5] jsonData (string) valor/muestra:\n', sample);
            if (wantJsonDataInResponse) {
                jsonDataBeforeSave = { type: 'string', length: len, value: len <= 3000 ? jsonData : sample };
            }
        } else if (jsonData && typeof jsonData === 'object') {
            const str = JSON.stringify(jsonData);
            const len = str.length;
            const sample = len <= 1200 ? str : str.substring(0, 800) + '\n... [truncado, total ' + len + ' caracteres] ...\n' + str.substring(len - 400);
            console.log('[2.5] jsonData (objeto) longitud stringificado:', len);
            console.log('[2.5] jsonData (objeto) keys:', Object.keys(jsonData));
            console.log('[2.5] jsonData (objeto) muestra:\n', sample);
            if (wantJsonDataInResponse) {
                jsonDataBeforeSave = { type: 'object', length: len, keys: Object.keys(jsonData), value: len <= 3000 ? jsonData : sample };
            }
        }

        // 3. Parsear JSON (acepta JSON estándar o formato Java/Map desde Jira)
        // Cuando jsonData viene sin comillas (key=value), se convierte a objeto y al guardar
        // se escribe siempre como JSON válido con comillas dobles en claves y valores.
        console.log('[3] Parseando JSON...');
        let parsedJson;
        let convertedFromJavaMap = false;
        try {
            if (typeof jsonData === 'string') {
                console.log('[3] jsonData es string, parseando...');
                const result = convertJsonDataFromJavaMap(jsonData);
                if (result.converted != null) {
                    parsedJson = result.converted;
                    convertedFromJavaMap = result.fromJavaMap === true;
                    if (convertedFromJavaMap) {
                        console.log('[3] ✅ Convertido desde formato Java/Map a JSON (comillas dobles al guardar)');
                    }
                } else {
                    throw new Error(result.error || 'Error convirtiendo jsonData');
                }
            } else {
                console.log('[3] jsonData es objeto, usando directamente');
                parsedJson = jsonData;
            }
            console.log('[3] ✅ JSON parseado correctamente');
            console.log('[3] Keys del JSON:', Object.keys(parsedJson));
        } catch (error) {
            console.error('[3] ❌ ERROR parseando JSON:', error.message);
            return res.status(400).json({
                success: false,
                error: 'El campo jsonData debe contener un JSON válido o formato Java/Map (key=value)',
                details: error.message,
                hint: 'jsonData debe ser JSON válido o formato tipo Java/Map. Si viene de Jira y falla, revisa que no haya caracteres de control (saltos de línea) dentro de strings.'
            });
        }

        // 4. Preparar nombre de archivo (preservar guiones)
        console.log('[4] Preparando nombre de archivo...');
        let fileName = String(filename).trim();
        console.log('[4] Filename original:', fileName);
        
        // Preservar guiones y puntos, solo eliminar caracteres realmente peligrosos
        fileName = fileName.replace(/[<>:"|?*\x00-\x1f]/g, '_').replace(/_{2,}/g, '_');
        
        if (!fileName.endsWith('.json')) {
            fileName = fileName + '.json';
        }
        
        if (!fileName || fileName === '.json') {
            fileName = 'archivo.json';
        }
        console.log('[4] Filename final:', fileName);

        // ===== LÓGICA DE GUARDADO (IDÉNTICA AL SCRIPT QUE FUNCIONA) =====
        
        // 5. Obtener rutas (en Linux/EC2 usar carpeta del proyecto para que guardado y Control-M usen el mismo archivo)
        console.log('[5] Obteniendo rutas...');
        const homeDir = os.homedir();
        const projectStoragePath = path.resolve(__dirname, 'jsonControlm');
        const isLinux = process.platform === 'linux';
        
        let storagePath;
        if (isLinux) {
            storagePath = projectStoragePath;
            console.log('[5] Linux/EC2: usando carpeta del proyecto:', storagePath);
        } else {
            const desktopPath = path.join(homeDir, 'Desktop');
            storagePath = path.join(desktopPath, 'jsonControlm');
            console.log('[5] Home directory:', homeDir);
            console.log('[5] Desktop path:', desktopPath);
            console.log('[5] Storage path (primario):', storagePath);
        }
        console.log('[5] Storage path (fallback proyecto):', projectStoragePath);
        
        let filePath = path.resolve(storagePath, fileName);
        
        // 6. Crear carpetas
        console.log('[6] Creando carpetas...');
        if (!isLinux) {
            const desktopPath = path.join(homeDir, 'Desktop');
            try {
                fs.mkdirSync(desktopPath, { recursive: true });
                console.log('[6] ✅ Desktop creado/verificado');
            } catch (e) {
                console.log('[6] ℹ️ Desktop ya existe o error (ignorado):', e.message);
            }
        }
        try {
            fs.mkdirSync(storagePath, { recursive: true });
            console.log('[6] ✅ jsonControlm creado/verificado');
        } catch (e) {
            console.log('[6] ℹ️ jsonControlm ya existe o error (ignorado):', e.message);
        }
        
        // 7. Preparar datos JSON (siempre en formato estándar: claves y valores entre comillas dobles)
        console.log('[7] Preparando JSON string (formato estándar con comillas dobles)...');
        const jsonString = JSON.stringify(parsedJson, null, 2);
        console.log('[7] ✅ JSON string preparado');
        console.log('[7] Longitud:', jsonString.length, 'caracteres');
        console.log('[7] Tamaño aproximado:', Math.round(jsonString.length / 1024), 'KB');
        
        // 8. ESCRIBIR ARCHIVO (con fallback si EPERM en Desktop)
        console.log('[8] Escribiendo archivo...');
        console.log('[8] Ruta completa:', filePath);
        try {
            fs.writeFileSync(filePath, jsonString, 'utf8');
            console.log('[8] ✅ Archivo escrito exitosamente');
        } catch (writeError) {
            const isPermissionError = writeError.code === 'EPERM' || writeError.code === 'EACCES';
            if (isPermissionError && storagePath !== projectStoragePath) {
                console.log('[8] ⚠️ Sin permisos en Escritorio, usando carpeta del proyecto:', projectStoragePath);
                try {
                    fs.mkdirSync(projectStoragePath, { recursive: true });
                    storagePath = projectStoragePath;
                    filePath = path.resolve(storagePath, fileName);
                    fs.writeFileSync(filePath, jsonString, 'utf8');
                    console.log('[8] ✅ Archivo escrito en carpeta del proyecto:', filePath);
                } catch (fallbackError) {
                    console.error('[8] ❌ ERROR también en fallback:', fallbackError.message);
                    throw fallbackError;
                }
            } else {
                console.error('[8] ❌ ERROR al escribir:', writeError.message);
                console.error('[8] Code:', writeError.code);
                throw writeError;
            }
        }
        
        // 8.5 Guardar el request que llegó a la API en la misma ruta (para inspección)
        const requestBasename = path.basename(fileName, '.json');
        const requestFilePath = path.resolve(storagePath, 'request-' + requestBasename + '.json');
        try {
            const requestToSave = {
                timestamp: new Date().toISOString(),
                ambiente: req.body.ambiente,
                token: req.body.token ? req.body.token.substring(0, 8) + '...' + req.body.token.substring(req.body.token.length - 4) : undefined,
                filename: req.body.filename,
                controlm_api: req.body.controlm_api,
                script_path: req.body.script_path,
                returnJsonDataBeforeSave: req.body.returnJsonDataBeforeSave,
                jsonData: req.body.jsonData
            };
            fs.writeFileSync(requestFilePath, JSON.stringify(requestToSave, null, 2), 'utf8');
            console.log('[8.5] ✅ Request guardado en:', requestFilePath);
        } catch (requestWriteErr) {
            console.log('[8.5] ⚠️ No se pudo guardar el request (ignorado):', requestWriteErr.message);
        }
        
        // 9. VERIFICAR INMEDIATAMENTE
        console.log('[9] Verificando archivo...');
        if (!fs.existsSync(filePath)) {
            console.error('[9] ❌ ERROR: Archivo no existe después de escribirlo');
            throw new Error('El archivo no existe después de escribirlo: ' + filePath);
        }
        
        const stats = fs.statSync(filePath);
        console.log('[9] ✅ Archivo existe');
        console.log('[9] ✅ Tamaño:', stats.size, 'bytes');
        
        // 10. LEER Y VALIDAR ARCHIVO
        console.log('[10] Leyendo archivo para validar...');
        const readContent = fs.readFileSync(filePath, 'utf8');
        console.log('[10] ✅ Archivo leído');
        console.log('[10] Longitud leída:', readContent.length, 'caracteres');
        
        // Validar que el JSON es válido
        try {
            JSON.parse(readContent);
            console.log('[10] ✅ JSON válido');
        } catch (parseError) {
            console.error('[10] ❌ ERROR: JSON inválido después de leer:', parseError.message);
            throw new Error('El archivo guardado no contiene JSON válido');
        }
        
        // VERIFICACIÓN FINAL ABSOLUTA
        console.log('[11] Verificación final absoluta...');
        if (!fs.existsSync(filePath)) {
            console.error('[11] ❌ ERROR CRÍTICO: Archivo no existe en verificación final');
            throw new Error('El archivo no existe después de todas las verificaciones');
        }
        
        const finalStats = fs.statSync(filePath);
        if (finalStats.size === 0) {
            console.error('[11] ❌ ERROR CRÍTICO: Archivo está vacío');
            throw new Error('El archivo está vacío');
        }
        
        console.log('[11] ✅ Verificación final exitosa');
        console.log('[11] ✅ Archivo existe y tiene contenido');
        console.log('[11] ✅ Tamaño final:', finalStats.size, 'bytes');
        
        console.log('\n========================================');
        console.log('=== ✅ ÉXITO: Archivo guardado ===');
        console.log('Filename:', fileName);
        console.log('File path:', filePath);
        console.log('File size:', finalStats.size, 'bytes');
        console.log('Storage path:', storagePath);
        console.log('========================================\n');
        
        // EJECUTAR CONTROL-M AUTOMÁTICAMENTE después de guardar (usar controlm_api ya recortado)
        let controlMResult = null;
        const controlmApiUrl = (controlm_api != null && typeof controlm_api === 'string') ? controlm_api.trim() : '';
        
        console.log('\n========================================');
        console.log('=== VERIFICACIÓN CONTROL-M ===');
        console.log('========================================');
        console.log(`controlm_api recibido: ${controlmApiUrl || 'NO PROPORCIONADO'}`);
        console.log(`token recibido: ${token ? 'SÍ (' + token.substring(0, 10) + '...)' : 'NO'}`);
        console.log(`filePath: ${filePath}`);
        console.log('========================================\n');
        
        if (controlmApiUrl && controlmApiUrl.startsWith('http') && token) {
            const absoluteFilePath = path.resolve(filePath);
            if (!fs.existsSync(absoluteFilePath)) {
                console.error('[CONTROL-M] ❌ El archivo no existe en la ruta que se enviará:', absoluteFilePath);
                controlMResult = { success: false, error: 'El archivo guardado no existe en: ' + absoluteFilePath };
            } else {
                console.log('[CONTROL-M] Ruta absoluta del archivo a enviar:', absoluteFilePath);
                console.log('\n========================================');
                console.log('=== EJECUTANDO CONTROL-M AUTOMÁTICAMENTE ===');
                console.log('========================================\n');
                
                try {
                    controlMResult = await executeControlMApi(controlmApiUrl, token, absoluteFilePath);
                    if (controlMResult.success) {
                        console.log('✅ Control-M ejecutado exitosamente');
                    } else {
                        console.error('❌ Control-M falló:', controlMResult.error);
                    }
                } catch (controlMError) {
                    console.error('❌ Error ejecutando Control-M (catch):', controlMError.message);
                    console.error('Stack:', controlMError.stack);
                    controlMResult = {
                        success: false,
                        error: controlMError.message,
                        status: controlMError.response?.status || 'N/A',
                        message: 'Error ejecutando API de Control-M'
                    };
                }
            }
        } else {
            console.log('ℹ️ Control-M no se ejecutará:');
            if (!controlmApiUrl) {
                console.log('   - Falta controlm_api');
            }
            if (!token) {
                console.log('   - Falta token');
            }
        }
        
        // EJECUTAR SCRIPT OPCIONAL después de guardar (y Control-M si aplica)
        let scriptResult = null;
        if (script_path && typeof script_path === 'string' && script_path.trim()) {
            const scriptPathTrimmed = script_path.trim();
            const projectDir = path.resolve(__dirname);
            const scriptsDir = path.join(projectDir, 'scripts');
            const resolvedScriptPath = path.isAbsolute(scriptPathTrimmed)
                ? path.resolve(scriptPathTrimmed)
                : path.resolve(projectDir, scriptPathTrimmed);
            
            // Seguridad: solo permitir scripts dentro de la carpeta scripts del proyecto
            if (!fs.existsSync(scriptsDir)) {
                try { fs.mkdirSync(scriptsDir, { recursive: true }); } catch (e) { /* ignore */ }
            }
            const allowed = resolvedScriptPath.startsWith(path.resolve(scriptsDir));
            
            if (!allowed) {
                console.error('[SCRIPT] ❌ Ruta no permitida (debe estar en carpeta scripts/):', resolvedScriptPath);
                scriptResult = {
                    success: false,
                    error: 'script_path debe estar dentro de la carpeta scripts del proyecto (ej: scripts/call-onpremise.js)'
                };
            } else if (!fs.existsSync(resolvedScriptPath)) {
                console.error('[SCRIPT] ❌ Archivo no existe:', resolvedScriptPath);
                scriptResult = {
                    success: false,
                    error: 'El archivo del script no existe: ' + resolvedScriptPath
                };
            } else {
                console.log('\n========================================');
                console.log('=== EJECUTANDO SCRIPT ===');
                console.log('========================================');
                console.log('[SCRIPT] Ruta:', resolvedScriptPath);
                const isSh = resolvedScriptPath.endsWith('.sh');
                const runCmd = isSh ? `bash "${resolvedScriptPath}"` : `node "${resolvedScriptPath}"`;
                const scriptEnv = {
                    ...process.env,
                    CONTROLM_API_URL: controlmApiUrl || '',
                    CONTROLM_TOKEN: token || '',
                    CONTROLM_FILE_PATH: filePath || '',
                    CONTROLM_FILENAME: fileName || ''
                };
                try {
                    const { stdout, stderr } = await execAsync(runCmd, {
                        timeout: 120000,
                        cwd: path.dirname(resolvedScriptPath),
                        maxBuffer: 1024 * 1024,
                        env: scriptEnv
                    });
                    console.log('[SCRIPT] ✅ Script ejecutado correctamente');
                    console.log('[SCRIPT] stdout:', stdout || '(vacío)');
                    if (stderr) console.log('[SCRIPT] stderr:', stderr);
                    scriptResult = {
                        success: true,
                        stdout: stdout || '',
                        stderr: stderr || null
                    };
                } catch (scriptError) {
                    console.error('[SCRIPT] ❌ Error ejecutando script:', scriptError.message);
                    scriptResult = {
                        success: false,
                        error: scriptError.message,
                        stdout: scriptError.stdout || null,
                        stderr: scriptError.stderr || null
                    };
                }
                console.log('========================================\n');
            }
        }
        
        // Responder con éxito - incluir resultado de Control-M y script si se ejecutaron
        let message = 'Archivo guardado exitosamente';
        if (controlMResult) {
            message += controlMResult.success ? ' y Control-M ejecutado' : ' pero Control-M falló';
        }
        if (scriptResult) {
            message += scriptResult.success ? ' y script ejecutado' : ' pero script falló';
        }
        
        const response = {
            success: true,
            message: message,
            filename: fileName,
            filePath: filePath,
            storagePath: storagePath,
            fileSize: finalStats.size,
            ambiente: ambiente,
            verified: true,
            // Para ver en Postman si el servidor recibió los campos (sin exponer token)
            received: {
                controlm_api: !!controlmApiUrl,
                token: !!token,
                script_path: !!script_path
            }
        };
        if (convertedFromJavaMap) {
            response.convertedFromJavaMap = true;
            response.jsonDataFormat = 'Convertido desde formato Java/Map (key=value) a JSON con comillas dobles';
        }
        if (controlMResult) {
            response.controlMResult = controlMResult;
        }
        if (scriptResult) {
            response.scriptResult = scriptResult;
        }
        if (wantJsonDataInResponse && jsonDataBeforeSave) {
            response.jsonDataBeforeSave = jsonDataBeforeSave;
        }
        
        // Guardar el response en la misma ruta que el request (jsonControlm)
        try {
            const responseCapturePath = path.join(requestStoragePath, 'response-' + requestTimestamp + '.json');
            const responseToSave = { ...response, _sentAt: new Date().toISOString() };
            fs.writeFileSync(responseCapturePath, JSON.stringify(responseToSave, null, 2), 'utf8');
            console.log('[RESPONSE] ✅ Response guardado:', responseCapturePath);
        } catch (responseErr) {
            console.error('[RESPONSE] ⚠️ No se pudo guardar el response:', responseErr.message);
        }
        
        res.json(response);

    } catch (error) {
        console.error('=== ❌ ERROR ===');
        console.error('Error:', error.message);
        console.error('Code:', error.code);
        console.error('Stack:', error.stack);
        const errorResponse = {
            success: false,
            error: 'Error al guardar el archivo',
            details: error.message,
            code: error.code,
            _sentAt: new Date().toISOString()
        };
        try {
            const requestStoragePathErr = path.resolve(__dirname, 'jsonControlm');
            const responseTimestampErr = new Date().toISOString().replace(/[:.]/g, '-');
            fs.mkdirSync(requestStoragePathErr, { recursive: true });
            fs.writeFileSync(path.join(requestStoragePathErr, 'response-' + responseTimestampErr + '.json'), JSON.stringify(errorResponse, null, 2), 'utf8');
            console.log('[RESPONSE] ✅ Response (error) guardado: response-' + responseTimestampErr + '.json');
        } catch (e) { /* ignore */ }
        res.status(500).json(errorResponse);
    }
});

// Endpoint para validar conversión de jsonData (formato Java/Map → JSON con comillas dobles)
// POST body: { "jsonData": "{GENER_NEXUS-...={Type=SimpleFolder, ...}}" }
// Respuesta: { success, converted, jsonString, fromJavaMap } para validar que se transforma correctamente
app.post('/convert-json-data', (req, res) => {
    try {
        const jsonData = req.body && (req.body.jsonData != null ? req.body.jsonData : req.body);
        if (jsonData == null) {
            return res.status(400).json({
                success: false,
                error: 'Se requiere el campo "jsonData" (string en formato Java/Map o JSON válido)'
            });
        }
        const str = typeof jsonData === 'string' ? jsonData : JSON.stringify(jsonData);
        const result = convertJsonDataFromJavaMap(str);
        if (result.converted != null) {
            return res.json({
                success: true,
                message: 'jsonData convertido a JSON con comillas dobles (formato estándar)',
                fromJavaMap: result.fromJavaMap === true,
                converted: result.converted,
                jsonString: result.jsonString,
                structureValid: typeof result.converted === 'object' && result.converted !== null && !Array.isArray(result.converted)
            });
        }
        return res.status(400).json({
            success: false,
            error: result.error || 'No se pudo convertir jsonData'
        });
    } catch (error) {
        console.error('Error en /convert-json-data:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint para descargar archivo JSON directamente
app.post('/download-json', async (req, res) => {
    try {
        const { ambiente, token, filename, jsonData } = req.body;

        // Validar que se proporcionen los datos requeridos
        if (!ambiente || !token || !filename || !jsonData) {
            return res.status(400).json({
                success: false,
                error: 'Se requieren los campos "ambiente", "token", "filename" y "jsonData"'
            });
        }

        // Validar que el ambiente sea DEV o QA
        if (!['DEV', 'QA'].includes(ambiente)) {
            return res.status(400).json({
                success: false,
                error: 'El campo "ambiente" solo puede tener los valores "DEV" o "QA"'
            });
        }

        // Validar que jsonData sea un objeto válido
        let parsedJson;
        try {
            parsedJson = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
        } catch (error) {
            return res.status(400).json({
                success: false,
                error: 'El campo jsonData debe contener un JSON válido'
            });
        }

        // Asegurar que el nombre del archivo tenga extensión .json
        const fileName = filename.endsWith('.json') ? filename : `${filename}.json`;

        // Convertir JSON a string
        const jsonString = JSON.stringify(parsedJson, null, 2);

        // Configurar headers para descarga de archivo
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Length', Buffer.byteLength(jsonString));

        // Enviar el archivo como descarga
        console.log(`Descargando archivo: ${fileName}`);
        res.send(jsonString);

    } catch (error) {
        console.error('Error al descargar el archivo:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor al descargar el archivo'
        });
    }
});

// Endpoint para ejecutar Control-M usando archivo guardado en EC2
app.post('/execute-controlm', async (req, res) => {
    try {
        const { ambiente, token, filename, controlm_api } = req.body;
        
        // Validar que se proporcionen los datos requeridos
        if (!ambiente || !token || !filename || !controlm_api) {
            return res.status(400).json({
                success: false,
                error: 'Se requieren los campos "ambiente", "token", "filename" y "controlm_api"'
            });
        }
        
        // Validar que el ambiente sea DEV o QA
        if (!['DEV', 'QA'].includes(ambiente)) {
            return res.status(400).json({
                success: false,
                error: 'El campo "ambiente" solo puede tener los valores "DEV" o "QA"'
            });
        }
        
        // Validar que controlm_api sea una URL válida
        if (!controlm_api.startsWith('http')) {
            return res.status(400).json({
                success: false,
                error: 'El campo "controlm_api" debe ser una URL válida (ej: https://controlms1de01:8446/automation-api/deploy)'
            });
        }
        
        // Construir la ruta completa del archivo
        const storagePath = getStoragePath();
        let fileName = String(filename).trim();
        if (!fileName.endsWith('.json')) {
            fileName = fileName + '.json';
        }
        const filePath = path.join(storagePath, fileName);
        
        // Verificar que el archivo existe
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                error: `El archivo no existe: ${filePath}`,
                filePath: filePath
            });
        }
        
        // Ejecutar Control-M API usando el archivo guardado
        const result = await executeControlMApi(controlm_api, token, filePath);
        
        if (result.success) {
            res.json({
                success: true,
                message: 'Control-M ejecutado exitosamente',
                ambiente: ambiente,
                filename: filename,
                filePath: result.filePath,
                controlMResponse: result.data,
                status: result.status
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Error ejecutando Control-M',
                details: result.error,
                status: result.status,
                message: result.message
            });
        }
        
    } catch (error) {
        console.error('Error en endpoint execute-controlm:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor',
            details: error.message
        });
    }
});

// Endpoint para guardar y ejecutar Control-M en un solo paso
app.post('/save-and-execute', async (req, res) => {
    try {
        const { ambiente, token, filename, jsonData, controlm_api } = req.body;
        
        // Validar que se proporcionen los datos requeridos
        if (!ambiente || !token || !filename || !jsonData) {
            return res.status(400).json({
                success: false,
                error: 'Se requieren los campos "ambiente", "token", "filename" y "jsonData"'
            });
        }
        
        // Validar que el ambiente sea DEV o QA
        if (!['DEV', 'QA'].includes(ambiente)) {
            return res.status(400).json({
                success: false,
                error: 'El campo "ambiente" solo puede tener los valores "DEV" o "QA"'
            });
        }
        
        // Validar que jsonData sea un objeto válido
        let parsedJson;
        try {
            parsedJson = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
        } catch (error) {
            return res.status(400).json({
                success: false,
                error: 'El campo jsonData debe contener un JSON válido'
            });
        }
        
        // Sanitizar y normalizar el nombre del archivo
        const fileName = sanitizeFilename(filename);
        
        // 1. Guardar el archivo en EC2
        const storagePath = getStoragePath();
        const filePath = path.join(storagePath, fileName);
        
        console.log(`=== GUARDANDO Y EJECUTANDO ===`);
        console.log(`Filename recibido: ${filename}`);
        console.log(`Filename final (sanitizado): ${fileName}`);
        console.log(`Ruta completa: ${filePath}`);
        
        try {
            fs.writeFileSync(filePath, JSON.stringify(parsedJson, null, 2), 'utf8');
            console.log(`✅ Archivo guardado en EC2: ${filePath}`);
            
            // Verificar que el archivo se guardó
            if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                console.log(`✅ Archivo verificado - Tamaño: ${stats.size} bytes`);
            }
        } catch (writeError) {
            console.error(`❌ ERROR al escribir archivo: ${writeError.message}`);
            throw writeError;
        }
        
        // 2. Ejecutar Control-M usando el archivo guardado (si se proporciona controlm_api)
        let controlMResult = null;
        if (controlm_api && controlm_api.startsWith('http')) {
            try {
                controlMResult = await executeControlMApi(controlm_api, token, filePath);
                console.log('✅ Control-M ejecutado exitosamente');
            } catch (controlMError) {
                console.error('❌ Error ejecutando Control-M:', controlMError.message);
                controlMResult = {
                    success: false,
                    error: controlMError.message,
                    status: controlMError.response?.status || 'N/A',
                    message: 'Error ejecutando API de Control-M'
                };
            }
        } else {
            console.log('ℹ️ Control-M no se ejecutará (falta controlm_api o no es una URL válida)');
        }
        
        const response = {
            success: true,
            message: controlMResult 
                ? (controlMResult.success 
                    ? 'Archivo guardado y Control-M ejecutado exitosamente' 
                    : 'Archivo guardado pero Control-M falló')
                : 'Archivo guardado exitosamente (Control-M no se ejecutó)',
            filename: fileName,
            filePath: filePath,
            storagePath: storagePath,
            ambiente: ambiente
        };
        
        if (controlMResult) {
            response.controlMResult = controlMResult;
        }
        
        res.json(response);
        
    } catch (error) {
        console.error('Error en endpoint save-and-execute:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor',
            details: error.message
        });
    }
});

// Endpoint para generar script automático
app.post('/generate-script', (req, res) => {
    try {
        const { ambiente, token, filename, jsonData } = req.body;
        
        if (!ambiente || !token || !filename || !jsonData) {
            return res.status(400).json({
                success: false,
                error: 'Se requieren los campos "ambiente", "token", "filename" y "jsonData"'
            });
        }
        
        // Generar script automático
        const autoSaveScript = generateAutoSaveScript(jsonData, filename, ambiente, token);
        
        res.json({
            success: true,
            message: 'Script automático generado',
            script: autoSaveScript,
            instructions: {
                message: 'Copia el script y ejecútalo en tu computadora',
                steps: [
                    '1. Copia todo el código del campo "script"',
                    '2. Pégalo en un archivo llamado "guardar-archivo.js"',
                    '3. Ejecuta: node guardar-archivo.js',
                    '4. El archivo se guardará automáticamente en Escritorio/jsonControlm'
                ]
            }
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Error generando script',
            message: error.message
        });
    }
});

// Endpoint de prueba para guardar un archivo de ejemplo - VERSIÓN SIMPLIFICADA
app.get('/test-save', async (req, res) => {
    try {
        console.log('[TEST-SAVE] Iniciando prueba de guardado...');
        
        const testData = {
            test: true,
            timestamp: new Date().toISOString(),
            message: 'Este es un archivo de prueba',
            data: { ejemplo: 'datos de prueba' }
        };
        
        const fileName = 'test-file.json';
        const storagePath = getStoragePath();
        const filePath = path.join(storagePath, fileName);
        
        console.log(`[TEST-SAVE] Ruta: ${filePath}`);
        
        // Guardar el archivo de forma directa
        fs.writeFileSync(filePath, JSON.stringify(testData, null, 2), { encoding: 'utf8', mode: 0o644 });
        console.log(`[TEST-SAVE] ✅ Archivo escrito`);
        
        // Verificar
        if (!fs.existsSync(filePath)) {
            throw new Error('El archivo no existe después de guardarlo');
        }
        
        const stats = fs.statSync(filePath);
        console.log(`[TEST-SAVE] ✅ Archivo verificado - Tamaño: ${stats.size} bytes`);
        
        res.json({
            success: true,
            message: 'Archivo de prueba guardado exitosamente',
            filePath: filePath,
            storagePath: storagePath,
            fileSize: stats.size,
            fileExists: true,
            instructions: `Ejecuta: ls -la ${filePath}`
        });
        
    } catch (error) {
        console.error('[TEST-SAVE] ❌ ERROR:', error.message);
        res.status(500).json({
            success: false,
            error: 'Error guardando archivo de prueba',
            message: error.message,
            filePath: error.filePath || 'N/A'
        });
    }
});

// Endpoint para forzar creación de carpeta (útil para debugging)
app.get('/create-storage', (req, res) => {
    try {
        console.log('=== FORZANDO CREACIÓN DE CARPETA DE ALMACENAMIENTO ===');
        const storagePath = getStoragePath();
        
        // Verificar que existe
        const exists = fs.existsSync(storagePath);
        let canWrite = false;
        try {
            fs.accessSync(storagePath, fs.constants.W_OK);
            canWrite = true;
        } catch (error) {
            console.error(`No se puede escribir en: ${storagePath}`, error.message);
        }
        
        // Intentar crear un archivo de prueba
        let testFileCreated = false;
        let testFilePath = '';
        try {
            testFilePath = path.join(storagePath, 'test-write.txt');
            fs.writeFileSync(testFilePath, 'test');
            testFileCreated = true;
            fs.unlinkSync(testFilePath); // Eliminar archivo de prueba
        } catch (error) {
            console.error(`Error creando archivo de prueba: ${error.message}`);
        }
        
        res.json({
            success: exists && canWrite,
            message: exists && canWrite 
                ? 'Carpeta de almacenamiento creada y verificada exitosamente' 
                : 'Error creando o verificando carpeta de almacenamiento',
            storagePath: storagePath,
            exists: exists,
            canWrite: canWrite,
            testFileCreated: testFileCreated,
            homeDir: os.homedir(),
            currentUser: getCurrentUser(),
            permissions: {
                desktop: fs.existsSync(path.join(os.homedir(), 'Desktop')),
                storage: exists
            }
        });
    } catch (error) {
        console.error('Error en create-storage:', error);
        res.status(500).json({
            success: false,
            error: 'Error creando carpeta de almacenamiento',
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Endpoint de diagnóstico
app.get('/diagnostic', (req, res) => {
    try {
        const currentUser = getCurrentUser();
        const storagePath = getStoragePath();
        
        // Listar archivos en la carpeta de almacenamiento
        let filesInStorage = [];
        try {
            if (fs.existsSync(storagePath)) {
                filesInStorage = fs.readdirSync(storagePath)
                    .filter(file => file.endsWith('.json'))
                    .map(file => {
                        const filePath = path.join(storagePath, file);
                        const stats = fs.statSync(filePath);
                        return {
                            filename: file,
                            size: stats.size,
                            created: stats.birthtime,
                            modified: stats.mtime
                        };
                    });
            }
        } catch (error) {
            console.error('Error listando archivos:', error.message);
        }
        
        // Información del sistema
        const systemInfo = {
            platform: process.platform,
            nodeVersion: process.version,
            environment: {
                USERNAME: process.env.USERNAME,
                USER: process.env.USER,
                USERPROFILE: process.env.USERPROFILE,
                HOMEDRIVE: process.env.HOMEDRIVE,
                HOMEPATH: process.env.HOMEPATH,
                HOME: process.env.HOME
            },
            osUserInfo: os.userInfo(),
            currentUser: currentUser,
            storagePath: storagePath,
            storageExists: fs.existsSync(storagePath),
            filesInStorage: filesInStorage,
            filesCount: filesInStorage.length,
            // Información adicional de Windows
            windowsInfo: process.platform === 'win32' ? {
                computerName: process.env.COMPUTERNAME,
                logonServer: process.env.LOGONSERVER,
                sessionName: process.env.SESSIONNAME,
                userDomain: process.env.USERDOMAIN,
                userDomainRoamingProfile: process.env.USERDOMAIN_ROAMINGPROFILE
            } : null
        };
        
        res.json({
            success: true,
            message: 'Información de diagnóstico del sistema EC2',
            systemInfo: systemInfo,
            recommendations: {
                message: 'Revisa la información del sistema para verificar las rutas detectadas',
                nextSteps: [
                    'Verifica que storagePath sea correcto',
                    'Verifica que storageExists sea true',
                    'Los archivos JSON se guardan en: ' + storagePath,
                    'Usa POST /execute-controlm para ejecutar Control-M con archivos guardados'
                ]
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Error en diagnóstico',
            message: error.message
        });
    }
});

// Endpoint para ver información de logs
app.get('/logs', (req, res) => {
    try {
        const logInfo = {
            message: 'Información sobre los logs de la API',
            instructions: {
                pm2: [
                    'Ver logs en tiempo real: pm2 logs save-json-api',
                    'Ver últimas 100 líneas: pm2 logs save-json-api --lines 100',
                    'Logs guardados en: ~/.pm2/logs/',
                    'Archivo output: ~/.pm2/logs/save-json-api-out.log',
                    'Archivo errores: ~/.pm2/logs/save-json-api-error.log'
                ],
                direct: [
                    'Si ejecutas con node server.js, los logs aparecen en la consola',
                    'Ejecuta: node server.js | tee server.log para guardar en archivo'
                ],
                systemd: [
                    'Ver logs: sudo journalctl -u save-json-api -f',
                    'Últimas 100 líneas: sudo journalctl -u save-json-api -n 100'
                ]
            },
            debugFiles: {
                location: '/tmp/',
                pattern: 'debug-*.txt',
                command: 'ls -la /tmp/debug-*.txt 2>/dev/null || echo "No hay archivos de debug"'
            },
            currentProcess: {
                pid: process.pid,
                uptime: Math.round(process.uptime()),
                memory: process.memoryUsage(),
                platform: process.platform,
                nodeVersion: process.version
            }
        };
        
        res.json(logInfo);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Error obteniendo información de logs',
            details: error.message
        });
    }
});

// Endpoint para ver la última llamada a Control-M
app.get('/last-controlm-call', (req, res) => {
    try {
        if (!lastControlMCall) {
            return res.json({
                success: false,
                message: 'No se ha realizado ninguna llamada a Control-M aún',
                instructions: 'Ejecuta POST /save-json con el campo controlm_api para que se registre la llamada'
            });
        }
        
        res.json({
            success: true,
            message: 'Información de la última llamada a Control-M',
            call: lastControlMCall,
            comparison: {
                expected: {
                    url: 'https://controlms1de01:8446/automation-api/deploy',
                    method: 'POST',
                    header: 'Authorization: Bearer TOKEN',
                    formField: 'definitionsFile',
                    formType: 'file (multipart/form-data)'
                },
                actual: {
                    url: lastControlMCall.url,
                    method: 'POST',
                    header: `Authorization: Bearer ${lastControlMCall.token}`,
                    formField: lastControlMCall.formData?.field || 'N/A',
                    formType: 'file (multipart/form-data)',
                    filename: lastControlMCall.formData?.filename || 'N/A',
                    filePath: lastControlMCall.filePath
                },
                matches: {
                    url: lastControlMCall.url.includes('controlms') && lastControlMCall.url.includes('/automation-api/deploy'),
                    hasToken: !!lastControlMCall.token && lastControlMCall.token !== 'NO',
                    hasFormField: lastControlMCall.formData?.field === 'definitionsFile',
                    fileExists: lastControlMCall.fileExists
                }
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Error obteniendo información de la última llamada',
            details: error.message
        });
    }
});

// Endpoint de prueba
app.get('/', (req, res) => {
    const storagePath = getStoragePath();
    
    res.json({
        message: 'API para guardar archivos JSON en EC2 y ejecutar Control-M',
        storagePath: storagePath,
        endpoints: {
            'GET /': 'Información de la API',
            'GET /diagnostic': 'Información de diagnóstico del sistema EC2',
            'GET /create-storage': 'Fuerza creación de carpeta de almacenamiento (debugging)',
            'GET /test-save': 'Guardar archivo de prueba para verificar que funciona',
            'POST /save-json': 'Guarda archivo JSON en EC2 (~/Desktop/jsonControlm). Acepta jsonData en formato Java/Map (key=value) y lo convierte a JSON con comillas dobles',
            'POST /convert-json-data': 'Valida conversión: recibe jsonData en formato Java/Map y devuelve el JSON convertido (comillas dobles) sin guardar',
            'POST /execute-controlm': 'Ejecuta Control-M usando archivo guardado en EC2',
            'POST /save-and-execute': 'Guarda archivo y ejecuta Control-M en un solo paso',
            'POST /download-json': 'Descarga archivo JSON',
            'POST /generate-script': 'Genera script automático para guardar archivo'
        },
        examples: {
            saveJson: {
                method: 'POST',
                url: '/save-json',
                body: {
                    ambiente: 'DEV',
                    token: 'mi-token-123',
                    filename: 'mi-archivo',
                    jsonData: { "nombre": "ejemplo", "valor": 123 }
                }
            },
            executeControlM: {
                method: 'POST',
                url: '/execute-controlm',
                body: {
                    ambiente: 'DEV',
                    token: 'mi-token-123',
                    filename: 'mi-archivo'
                }
            },
            saveAndExecute: {
                method: 'POST',
                url: '/save-and-execute',
                body: {
                    ambiente: 'DEV',
                    token: 'mi-token-123',
                    filename: 'mi-archivo',
                    jsonData: { "nombre": "ejemplo", "valor": 123 }
                }
            }
        }
    });
});

// Exportar conversión para tests (solo cuando se requiere el módulo, no cuando se ejecuta node server.js)
if (require.main !== module) {
    module.exports = { convertJsonDataFromJavaMap };
    return;
}

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`🚀 Iniciando servidor en puerto ${PORT}...`);
    console.log(`========================================`);
    
    try {
        const currentUser = getCurrentUser();
        console.log(`👤 Usuario detectado: ${currentUser}`);
        
        console.log(`📁 Intentando inicializar ruta de almacenamiento...`);
        const storagePath = getStoragePath();
        
        // Verificar una vez más que existe
        if (fs.existsSync(storagePath)) {
            console.log(`✅ VERIFICACIÓN FINAL: Carpeta existe: ${storagePath}`);
        } else {
            console.error(`❌ VERIFICACIÓN FINAL FALLIDA: Carpeta NO existe: ${storagePath}`);
            console.error(`   Esto es un problema crítico. Revisa los logs anteriores.`);
        }
        
        console.log(`========================================`);
        console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
        console.log(`👤 Usuario: ${currentUser}`);
        console.log(`📁 Ruta de almacenamiento: ${storagePath}`);
        console.log(`📁 Ruta existe: ${fs.existsSync(storagePath) ? 'SÍ' : 'NO'}`);
        console.log(`========================================`);
        console.log(`📋 Endpoints disponibles:`);
        console.log(`   GET / - Información de la API`);
        console.log(`   GET /diagnostic - Información de diagnóstico`);
        console.log(`   GET /create-storage - Forzar creación de carpeta`);
        console.log(`   GET /test-save - Guardar archivo de prueba`);
        console.log(`   POST /save-json - Guarda JSON en EC2`);
        console.log(`   POST /execute-controlm - Ejecuta Control-M con archivo guardado`);
        console.log(`   POST /save-and-execute - Guarda y ejecuta en un paso`);
        console.log(`========================================`);
    } catch (error) {
        console.error(`========================================`);
        console.error(`❌ ERROR CRÍTICO al inicializar servidor:`);
        console.error(`   ${error.message}`);
        console.error(`   Stack: ${error.stack}`);
        console.error(`========================================`);
        console.error(`El servidor continuará pero puede no funcionar correctamente.`);
        console.error(`Revisa los logs y ejecuta GET /create-storage para más información.`);
        console.error(`========================================`);
    }
});
