const rules = require('./rules/DLF.json');

function parseNumberWithUnits(token){
  // token examples: "900", "900mm", "900 mm", "0.9 m", "900.0cm"
  if(!token) return null;
  token = token.toString().trim().toLowerCase();
  const m = token.match(/([+-]?\d+(\.\d+)?)(\s*)(mm|cm|m)?/);
  if(!m) return null;
  const num = Number(m[1]);
  const unit = m[4] || '';
  // normalize to millimetres
  let valueMm = num;
  if(unit === 'm') valueMm = num * 1000;
  else if(unit === 'cm') valueMm = num * 10;
  else if(unit === 'mm' || unit === '') valueMm = num;
  return { raw: token, num, unit: unit || 'mm', valueMm };
}

function extractNumbersWithContext(text){
  const results = [];
  // regex to capture numbers with optional unit (mm/cm/m) and a few words around it
  const regex = /(?:\b|^)([+-]?\d+(?:\.\d+)?(?:\s*(?:mm|cm|m))?)(?:\b|$)/ig;
  let m;
  while((m = regex.exec(text)) !== null){
    const token = m[1];
    const parsed = parseNumberWithUnits(token);
    if(parsed){
      // capture a small context window
      const start = Math.max(0, m.index - 30);
      const ctx = text.slice(start, Math.min(text.length, m.index + token.length + 30));
      results.push({ token, parsed, context: ctx.trim() });
    }
  }
  return results;
}

function compareNumber(foundValueMm, op, requiredValue){
  const req = Number(requiredValue);
  if(Number.isNaN(req)) return false;
  // assume requiredValue is in same units as stored (we expect rule value in mm for now)
  switch(op){
    case '>=': return foundValueMm >= req;
    case '<=': return foundValueMm <= req;
    case '>': return foundValueMm > req;
    case '<': return foundValueMm < req;
    case '=': return Math.abs(foundValueMm - req) < 1e-6;
    default: return false;
  }
}

function runChecksOnText(rules, ocrText) {
  const text = (ocrText||'').toLowerCase();
  const foundNumbers = extractNumbersWithContext(text); // array of {token, parsed, context}

  return rules.map(rule => {
    const check = rule.technical_check || {};
    const type = check.type || 'keyword';

    if(type === 'presence' || type === 'keyword'){
      const matches = (check.example_text_matches || []).map(s => s.toLowerCase());
      const found = matches.some(k => text.includes(k));
      return { id: rule.id, ok: found, type, foundMatches: matches.filter(k => text.includes(k)), rule };
    }

    if(type === 'numeric'){
      // Our convention: rule.value is expected in same base unit as rule.units (we will convert to mm if units provided)
      let required = check.value;
      // normalize required to mm if units present on rule
      let requiredMm = Number(required);
      const ru = (check.units || '').toLowerCase();
      if(ru === 'm') requiredMm = Number(required) * 1000;
      if(ru === 'cm') requiredMm = Number(required) * 10;
      // if ru is 'mm' or empty, leave as-is

      // Look through foundNumbers and compare
      let matched = [];
      for(const f of foundNumbers){
        const foundMm = f.parsed.valueMm;
        if(compareNumber(foundMm, check.operator || '>=', requiredMm)){
          matched.push({ token: f.token, foundMm, context: f.context });
        }
      }

      return {
        id: rule.id,
        ok: matched.length > 0,
        type,
        required: requiredMm,
        foundNumbers: foundNumbers,
        matched,
        rule
      };
    }

    return { id: rule.id, ok:false, note:'type not handled', rule };
  });
}

// Example OCR text (replace with actual OCR output)
const sampleText = `
Corridor width shall not be less than 900 mm.
Title block: Revision 02, Date: 01-Jan-2025
`;

// run
console.log(JSON.stringify(runChecksOnText(rules, sampleText), null, 2));
