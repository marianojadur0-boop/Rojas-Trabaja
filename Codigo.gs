/* =====================================================================
   ROJAS TRABAJA · Base de datos gratuita y privada (Google Sheets + Apps Script)
   ---------------------------------------------------------------------
   Se instala UNA sola vez (ver LEEME.md, Paso 4). Después funciona solo.

   PRIVACIDAD (lo importante):
   - El público NUNCA ve nombre, contacto, experiencia ni CV de las personas.
     Solo ve datos anónimos: puesto buscado, rubro, localidad, rango de edad.
   - Solo las EMPRESAS VERIFICADAS (aprobadas por el administrador) ven perfiles completos y CVs.
   - Cada empresa ve las POSTULACIONES de SUS ofertas con el ID y código de esa oferta.
   - Los CVs se guardan en una carpeta privada de Google Drive (nadie tiene el link).
   - Todos los días se borran solos los datos personales vencidos:
     perfiles a los 30 días y postulaciones a los 60 días (quedan solo números para estadísticas).
   - Las claves se guardan cifradas (hash), y hay bloqueo ante intentos repetidos.

   No hace falta tocar nada de este archivo.
   ===================================================================== */

const DIAS = { Ofertas: 7, Perfiles: 30 };
const DIAS_POSTULACIONES = 60;
const AUTO_APROBAR_EMPRESAS = false;      // true = las empresas entran sin aprobación (menos seguro)
const MAX_DENUNCIAS = 3;
const MAX_PUBLICACIONES_POR_HORA = 60;
const MAX_CV_BYTES = 2 * 1024 * 1024;     // 2 MB
const PALABRAS_PROHIBIDAS = ["multinivel", "pago previo", "abonar inscripcion", "abonar inscripción",
  "costo de inscripcion", "costo de inscripción", "inversion inicial", "inversión inicial", "criptomoneda",
  "piramide", "pirámide"];
const EDADES = ["16-17", "18-24", "25-34", "35-44", "45-54", "55 o más"];

const COLUMNAS = {
  Ofertas: ["id", "codigo", "fecha", "estado", "denuncias", "puesto", "empresa", "localidad", "rubro",
    "modalidad", "descripcion", "requisitos", "contacto", "primer_empleo"],
  Perfiles: ["id", "codigo", "fecha", "estado", "denuncias", "nombre", "edad", "localidad", "rubro",
    "puesto_buscado", "experiencia", "disponibilidad", "contacto", "primer_empleo", "cv_id"],
  Postulaciones: ["id", "fecha", "estado", "oferta_id", "nombre", "edad", "localidad", "contacto", "mensaje", "cv_id"],
  Empresas: ["id", "codigo", "fecha", "estado", "empresa", "cuit", "rubro", "localidad", "responsable", "contacto"],
  Busquedas: ["fecha", "localidad", "rubro", "modo"]
};
const OBLIGATORIOS = {
  Ofertas: ["puesto", "empresa", "localidad", "rubro", "descripcion", "contacto"],
  Perfiles: ["nombre", "edad", "localidad", "rubro", "puesto_buscado", "contacto"],
  Postulaciones: ["nombre", "edad", "contacto"],
  Empresas: ["empresa", "localidad", "rubro", "responsable", "contacto"]
};
const PUBLICO_PERFIL = ["id", "fecha", "edad", "localidad", "rubro", "puesto_buscado", "disponibilidad", "primer_empleo"];
const LARGO_MAX = { descripcion: 1200, requisitos: 600, experiencia: 900, mensaje: 600 };
const ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/* ---------------- utilidades ---------------- */
function hoja_(nombre) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let h = ss.getSheetByName(nombre);
  if (!h) { h = ss.insertSheet(nombre); h.appendRow(COLUMNAS[nombre]); h.setFrozenRows(1); }
  return h;
}
function tipo_(t) { return t === "perfil" || t === "perfiles" ? "Perfiles" : "Ofertas"; }
function json_(txt) { return ContentService.createTextOutput(txt).setMimeType(ContentService.MimeType.JSON); }
function salida_(obj) { return json_(JSON.stringify(obj)); }
function limpiar_(v, max) {
  let s = String(v == null ? "" : v).replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").trim().slice(0, max || 160);
  if (/^[=+\-@]/.test(s)) s = "'" + s; // evita fórmulas en la planilla
  return s;
}
function hash_(codigo, id) {
  const sal = PropertiesService.getScriptProperties().getProperty("SAL") || "";
  const b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, sal + ":" + id + ":" + String(codigo || "").toUpperCase().trim());
  return b.map(function (x) { return ((x + 256) % 256).toString(16).padStart(2, "0"); }).join("");
}
function azar_(n) { let s = ""; for (let i = 0; i < n; i++) s += ABC.charAt(Math.floor(Math.random() * ABC.length)); return s; }
function filas_(nombre) {
  const h = hoja_(nombre), datos = h.getDataRange().getValues(), cab = datos.shift();
  return { h: h, cab: cab, filas: datos.map(function (f, i) {
    const o = { _fila: i + 2 }; cab.forEach(function (c, j) { o[c] = f[j]; }); return o;
  }) };
}
function set_(t, o, campo, valor) { t.h.getRange(o._fila, t.cab.indexOf(campo) + 1).setValue(valor); }
function ms_(f) { return new Date(f).getTime(); }
function bool_(v) { return v === true || v === "TRUE" || v === "true"; }
function vigentes_(nombre) {
  const limite = Date.now() - DIAS[nombre] * 864e5;
  return filas_(nombre).filas.filter(function (o) {
    return o.estado === "activa" && Number(o.denuncias || 0) < MAX_DENUNCIAS && ms_(o.fecha) >= limite;
  });
}
function elegir_(o, campos) { const p = {}; campos.forEach(function (c) { p[c] = o[c]; }); p.fecha = new Date(o.fecha).toISOString(); if ("primer_empleo" in p) p.primer_empleo = bool_(p.primer_empleo); return p; }

/* Bloqueo ante intentos fallidos (anti fuerza bruta) */
function bloqueado_(clave, max) { return Number(CacheService.getScriptCache().get("f_" + clave) || 0) >= (max || 8); }
function fallo_(clave) { const c = CacheService.getScriptCache(), n = Number(c.get("f_" + clave) || 0) + 1; c.put("f_" + clave, String(n), 3600); }
function limite_(clave, max) {
  const c = CacheService.getScriptCache(), n = Number(c.get(clave) || 0);
  if (n >= max) return true; c.put(clave, String(n + 1), 3600); return false;
}

/* Verificación de credenciales */
function credencial_(nombre, id, codigo) {
  const cid = String(id || "").toUpperCase().trim();
  if (!cid || bloqueado_(nombre + cid) || bloqueado_("global_" + nombre, 60)) return { error: "Demasiados intentos. Esperá una hora." };
  const t = filas_(nombre), o = t.filas.filter(function (f) { return String(f.id) === cid; })[0];
  if (!o || o.codigo !== hash_(codigo, cid)) { fallo_(nombre + cid); fallo_("global_" + nombre); return { error: "El ID o el código no coinciden." }; }
  return { t: t, o: o };
}
function empresaOk_(id, codigo) {
  const c = credencial_("Empresas", id, codigo);
  if (c.error) return c;
  if (c.o.estado !== "aprobada") return { error: c.o.estado === "pendiente" ? "Tu empresa todavía está pendiente de aprobación." : "El acceso de esta empresa no está habilitado." };
  return c;
}
function adminOk_(clave) {
  if (bloqueado_("admin")) return false;
  const h = PropertiesService.getScriptProperties().getProperty("ADMIN_HASH");
  if (h && h === hash_(clave, "ADMIN")) return true;
  fallo_("admin"); return false;
}

/* CV en Drive privado */
function guardarCV_(cv, nombreArchivo) {
  if (!cv || !cv.base64) return "";
  const bytes = Utilities.base64Decode(String(cv.base64));
  if (bytes.length > MAX_CV_BYTES) throw new Error("El CV supera los 2 MB.");
  if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) throw new Error("El CV tiene que ser un archivo PDF.");
  const carpeta = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty("CARPETA_CV"));
  const f = carpeta.createFile(Utilities.newBlob(bytes, "application/pdf", nombreArchivo + ".pdf"));
  return f.getId();
}
function borrarCV_(id) { if (!id) return; try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {} }

/* ---------------- LECTURA PÚBLICA ---------------- */
function doGet(e) {
  const nombre = tipo_(e && e.parameter && e.parameter.tipo);
  const cache = CacheService.getScriptCache(), clave = "lista_" + nombre, g = cache.get(clave);
  if (g) return json_(g);
  const lista = vigentes_(nombre).map(function (o) {
    if (nombre === "Perfiles") { const p = elegir_(o, PUBLICO_PERFIL); p.tiene_cv = !!o.cv_id; return p; }
    return elegir_(o, COLUMNAS.Ofertas.filter(function (c) { return ["codigo", "denuncias", "estado", "contacto"].indexOf(c) < 0; }));
  }).sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; });
  const txt = JSON.stringify({ ok: true, tipo: nombre, items: lista });
  try { cache.put(clave, txt, 120); } catch (err) {}
  return json_(txt);
}

/* ---------------- ACCIONES ---------------- */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const b = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const acciones = {
      publicar: function () { return publicar_(tipo_(b.tipo), b.datos || {}, b.cv); },
      renovar: function () { return gestionar_(tipo_(b.tipo), "renovar", b.id, b.codigo); },
      baja: function () { return gestionar_(tipo_(b.tipo), "baja", b.id, b.codigo); },
      denunciar: function () { return denunciar_(tipo_(b.tipo), b.id); },
      postular: function () { return postular_(b.oferta_id, b.datos || {}, b.cv); },
      empresa_registro: function () { return registrarEmpresa_(b.datos || {}); },
      empresa_perfiles: function () { return empresaPerfiles_(b.id, b.codigo); },
      oferta_postulantes: function () { return postulantes_(b.id, b.codigo); },
      cv: function () { return descargarCV_(b); },
      evento: function () { return evento_(b.datos || {}); },
      admin_stats: function () { return adminStats_(b.clave); },
      admin_empresa: function () { return adminEmpresa_(b.clave, b.id, b.estado); }
    };
    const f = acciones[b.accion];
    const r = f ? f() : { ok: false, error: "Acción desconocida." };
    if (r.ok && ["publicar", "renovar", "baja", "denunciar"].indexOf(b.accion) >= 0) {
      CacheService.getScriptCache().remove("lista_" + tipo_(b.tipo));
    }
    return salida_(r);
  } catch (err) {
    return salida_({ ok: false, error: (err && err.message && err.message.indexOf("CV") >= 0) ? err.message : "No se pudo procesar. Probá de nuevo en un minuto." });
  } finally {
    try { lock.releaseLock(); } catch (err) {}
  }
}

function validar_(nombre, d) {
  if (d.web) return { trampa: true };
  if (d.acepto !== true) return { error: "Tenés que aceptar las condiciones." };
  if (limite_("pub_hora", MAX_PUBLICACIONES_POR_HORA)) return { error: "Hay muchas publicaciones en este momento. Probá en una hora." };
  const v = {};
  COLUMNAS[nombre].forEach(function (c) {
    if (["id", "codigo", "fecha", "estado", "denuncias", "cv_id", "oferta_id"].indexOf(c) >= 0) return;
    v[c] = c === "primer_empleo" ? d[c] === true : limpiar_(d[c], LARGO_MAX[c]);
  });
  if (OBLIGATORIOS[nombre].some(function (c) { return !v[c]; })) return { error: "Faltan datos obligatorios." };
  if ("edad" in v && EDADES.indexOf(v.edad) < 0) return { error: "Elegí un rango de edad." };
  const texto = Object.keys(v).map(function (k) { return String(v[k]); }).join(" ").toLowerCase();
  if (PALABRAS_PROHIBIDAS.some(function (p) { return texto.indexOf(p) >= 0; }))
    return { error: "La publicación no cumple las condiciones (no se aceptan cobros ni esquemas de inversión)." };
  return { v: v };
}
function fila_(nombre, v, extra) {
  return COLUMNAS[nombre].map(function (c) { return c in extra ? extra[c] : (c in v ? v[c] : ""); });
}

function publicar_(nombre, d, cv) {
  const r = validar_(nombre, d);
  if (r.trampa) return { ok: true, id: "OK", codigo: "OK", vence_dias: 0 };
  if (r.error) return { ok: false, error: r.error };
  const id = azar_(6), codigo = azar_(8);
  const cvId = nombre === "Perfiles" ? guardarCV_(cv, "CV-perfil-" + id) : "";
  hoja_(nombre).appendRow(fila_(nombre, r.v, { id: id, codigo: hash_(codigo, id), fecha: new Date(), estado: "activa", denuncias: 0, cv_id: cvId }));
  return { ok: true, id: id, codigo: codigo, vence_dias: DIAS[nombre] };
}

function anonimizar_(t, o, campos) {
  campos.forEach(function (c) { set_(t, o, c, ""); });
  if (o.cv_id) { borrarCV_(o.cv_id); set_(t, o, "cv_id", ""); }
}

function gestionar_(nombre, accion, id, codigo) {
  const c = credencial_(nombre, id, codigo);
  if (c.error) return { ok: false, error: c.error };
  if (accion === "baja") {
    set_(c.t, c.o, "estado", "baja");
    if (nombre === "Perfiles") anonimizar_(c.t, c.o, ["nombre", "contacto", "experiencia"]);
    return { ok: true, mensaje: nombre === "Perfiles" ? "Listo: tu perfil se dio de baja y tus datos personales y CV se borraron." : "Listo, la oferta se dio de baja." };
  }
  if (c.o.estado !== "activa") return { ok: false, error: "Esta publicación ya no está activa. Podés publicarla de nuevo." };
  if (Number(c.o.denuncias || 0) >= MAX_DENUNCIAS) return { ok: false, error: "Esta publicación fue ocultada por denuncias." };
  set_(c.t, c.o, "fecha", new Date());
  return { ok: true, mensaje: "Listo, se renovó por " + DIAS[nombre] + " días más." };
}

function denunciar_(nombre, id) {
  if (limite_("den_hora", 100)) return { ok: false, error: "Probá más tarde." };
  const t = filas_(nombre), cid = String(id || "").toUpperCase().trim();
  const o = t.filas.filter(function (f) { return String(f.id) === cid; })[0];
  if (!o) return { ok: false, error: "No se encontró la publicación." };
  set_(t, o, "denuncias", Number(o.denuncias || 0) + 1);
  return { ok: true, mensaje: "Gracias, la denuncia quedó registrada." };
}

function postular_(ofertaId, d, cv) {
  const oid = String(ofertaId || "").toUpperCase().trim();
  if (!vigentes_("Ofertas").some(function (o) { return String(o.id) === oid; })) return { ok: false, error: "Esta oferta ya no está vigente." };
  const r = validar_("Postulaciones", d);
  if (r.trampa) return { ok: true };
  if (r.error) return { ok: false, error: r.error };
  const id = azar_(6), cvId = guardarCV_(cv, "CV-postulacion-" + oid + "-" + id);
  hoja_("Postulaciones").appendRow(fila_("Postulaciones", r.v, { id: id, fecha: new Date(), estado: "activa", oferta_id: oid, cv_id: cvId }));
  return { ok: true, mensaje: "¡Listo! Tu postulación le llegó a la empresa. Solo ella puede ver tus datos." };
}

function registrarEmpresa_(d) {
  const r = validar_("Empresas", d);
  if (r.trampa) return { ok: true, id: "OK", codigo: "OK", estado: "pendiente" };
  if (r.error) return { ok: false, error: r.error };
  const id = "E" + azar_(5), codigo = azar_(8), estado = AUTO_APROBAR_EMPRESAS ? "aprobada" : "pendiente";
  hoja_("Empresas").appendRow(fila_("Empresas", r.v, { id: id, codigo: hash_(codigo, id), fecha: new Date(), estado: estado }));
  return { ok: true, id: id, codigo: codigo, estado: estado };
}

function empresaPerfiles_(id, codigo) {
  const c = empresaOk_(id, codigo);
  if (c.error) return { ok: false, error: c.error };
  const lista = vigentes_("Perfiles").map(function (o) {
    const p = elegir_(o, ["id", "fecha", "nombre", "edad", "localidad", "rubro", "puesto_buscado", "experiencia", "disponibilidad", "contacto", "primer_empleo"]);
    p.tiene_cv = !!o.cv_id; return p;
  }).sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; });
  return { ok: true, empresa: c.o.empresa, items: lista };
}

function postulantes_(id, codigo) {
  const c = credencial_("Ofertas", id, codigo);
  if (c.error) return { ok: false, error: c.error };
  const oid = String(c.o.id);
  const lista = filas_("Postulaciones").filas.filter(function (p) { return String(p.oferta_id) === oid && p.estado === "activa"; })
    .map(function (p) { const x = elegir_(p, ["id", "fecha", "nombre", "edad", "localidad", "contacto", "mensaje"]); x.tiene_cv = !!p.cv_id; return x; })
    .sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; });
  return { ok: true, puesto: c.o.puesto, items: lista };
}

function descargarCV_(b) {
  let fila = null;
  if (b.como === "empresa") {
    const c = empresaOk_(b.id, b.codigo); if (c.error) return { ok: false, error: c.error };
    fila = vigentes_("Perfiles").filter(function (p) { return String(p.id) === String(b.item); })[0];
  } else {
    const c = credencial_("Ofertas", b.id, b.codigo); if (c.error) return { ok: false, error: c.error };
    fila = filas_("Postulaciones").filas.filter(function (p) { return String(p.id) === String(b.item) && String(p.oferta_id) === String(c.o.id) && p.estado === "activa"; })[0];
  }
  if (!fila || !fila.cv_id) return { ok: false, error: "Este CV ya no está disponible." };
  const blob = DriveApp.getFileById(fila.cv_id).getBlob();
  return { ok: true, nombre: "CV-" + String(fila.nombre || "candidato").replace(/[^\wáéíóúñÁÉÍÓÚÑ ]/g, "").trim() + ".pdf", base64: Utilities.base64Encode(blob.getBytes()) };
}

function evento_(d) {
  if (limite_("ev_hora", 1500)) return { ok: true };
  const loc = limpiar_(d.localidad, 40), rub = limpiar_(d.rubro, 40), modo = limpiar_(d.modo, 20);
  if (!loc && !rub) return { ok: true };
  hoja_("Busquedas").appendRow([new Date(), loc, rub, modo]);
  return { ok: true };
}

/* ---------------- PANEL DEL ADMINISTRADOR ---------------- */
function contar_(lista, campo, vacio) {
  const m = {};
  lista.forEach(function (o) { const k = String(o[campo] || vacio || "Sin dato"); m[k] = (m[k] || 0) + 1; });
  return Object.keys(m).map(function (k) { return [k, m[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
}
function adminStats_(clave) {
  if (!adminOk_(clave)) return { ok: false, error: "Clave incorrecta." };
  const desde = Date.now() - 90 * 864e5, reciente = function (o) { return ms_(o.fecha) >= desde; };
  const ofertas = filas_("Ofertas").filas.filter(reciente), perfiles = filas_("Perfiles").filas.filter(reciente);
  const posts = filas_("Postulaciones").filas.filter(reciente), busq = filas_("Busquedas").filas.filter(reciente);
  const empresas = filas_("Empresas").filas;
  const dias = {};
  for (let i = 29; i >= 0; i--) { const k = Utilities.formatDate(new Date(Date.now() - i * 864e5), "America/Argentina/Buenos_Aires", "dd/MM"); dias[k] = [0, 0, 0]; }
  [[ofertas, 0], [perfiles, 1], [posts, 2]].forEach(function (x) {
    x[0].forEach(function (o) { const k = Utilities.formatDate(new Date(o.fecha), "America/Argentina/Buenos_Aires", "dd/MM"); if (dias[k]) dias[k][x[1]]++; });
  });
  const titulos = {}; ofertas.forEach(function (o) { titulos[o.id] = o.puesto + " · " + o.empresa; });
  const porOferta = contar_(posts, "oferta_id").slice(0, 10).map(function (x) { return [titulos[x[0]] || x[0], x[1]]; });
  return { ok: true, periodo: "Últimos 90 días",
    totales: { ofertas_vigentes: vigentes_("Ofertas").length, perfiles_vigentes: vigentes_("Perfiles").length,
      postulaciones: posts.length, busquedas: busq.length,
      empresas_aprobadas: empresas.filter(function (e) { return e.estado === "aprobada"; }).length,
      empresas_pendientes: empresas.filter(function (e) { return e.estado === "pendiente"; }).length },
    graficos: {
      busquedas_zona: contar_(busq, "localidad", "Todas las zonas"), busquedas_rubro: contar_(busq, "rubro", "Todos los rubros"),
      ofertas_zona: contar_(ofertas, "localidad"), ofertas_rubro: contar_(ofertas, "rubro"),
      perfiles_zona: contar_(perfiles, "localidad"), perfiles_edad: EDADES.map(function (e) { return [e, perfiles.filter(function (p) { return p.edad === e; }).length]; }),
      perfiles_rubro: contar_(perfiles, "rubro"),
      primer_empleo: [["Primer empleo", perfiles.filter(function (p) { return bool_(p.primer_empleo); }).length], ["Con experiencia", perfiles.filter(function (p) { return !bool_(p.primer_empleo); }).length]],
      postulaciones_edad: EDADES.map(function (e) { return [e, posts.filter(function (p) { return p.edad === e; }).length]; }),
      postulaciones_oferta: porOferta
    },
    actividad: Object.keys(dias).map(function (k) { return [k].concat(dias[k]); }),
    empresas: empresas.map(function (e) { return { id: e.id, fecha: new Date(e.fecha).toISOString(), estado: e.estado, empresa: e.empresa, cuit: e.cuit, rubro: e.rubro, localidad: e.localidad, responsable: e.responsable, contacto: e.contacto }; }).reverse()
  };
}
function adminEmpresa_(clave, id, estado) {
  if (!adminOk_(clave)) return { ok: false, error: "Clave incorrecta." };
  if (["aprobada", "rechazada", "pendiente"].indexOf(estado) < 0) return { ok: false, error: "Estado inválido." };
  const t = filas_("Empresas"), o = t.filas.filter(function (f) { return String(f.id) === String(id); })[0];
  if (!o) return { ok: false, error: "No se encontró la empresa." };
  set_(t, o, "estado", estado);
  return { ok: true };
}

/* ---------------- LIMPIEZA AUTOMÁTICA DIARIA ---------------- */
function limpiezaDiaria() {
  const ahora = Date.now();
  const p = filas_("Perfiles");
  p.filas.forEach(function (o) {
    const vencido = ms_(o.fecha) < ahora - DIAS.Perfiles * 864e5;
    if ((vencido || o.estado !== "activa" || Number(o.denuncias || 0) >= MAX_DENUNCIAS) && (o.nombre || o.contacto || o.cv_id)) {
      anonimizar_(p, o, ["nombre", "contacto", "experiencia"]);
      if (o.estado === "activa" && vencido) set_(p, o, "estado", "vencida");
    }
  });
  const q = filas_("Postulaciones");
  q.filas.forEach(function (o) {
    if (ms_(o.fecha) < ahora - DIAS_POSTULACIONES * 864e5 && (o.nombre || o.contacto || o.cv_id)) {
      anonimizar_(q, o, ["nombre", "contacto", "mensaje"]); set_(q, o, "estado", "vencida");
    }
  });
}

/* ---------------- INSTALACIÓN (ejecutar una vez) ---------------- */
function instalar() {
  const props = PropertiesService.getScriptProperties();
  Object.keys(COLUMNAS).forEach(hoja_);
  if (!props.getProperty("SAL")) props.setProperty("SAL", Utilities.getUuid());
  if (!props.getProperty("CARPETA_CV")) props.setProperty("CARPETA_CV", DriveApp.createFolder("Rojas Trabaja - CVs (PRIVADO, no compartir)").getId());
  if (!ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === "limpiezaDiaria"; }))
    ScriptApp.newTrigger("limpiezaDiaria").timeBased().everyDays(1).atHour(3).create();
  nuevaClaveAdmin();
  return "Listo";
}

/* Genera una clave nueva para el Panel del administrador y la muestra en la hoja "Clave admin".
   Si la olvidás o creés que alguien la vio, ejecutá esta función de nuevo. */
function nuevaClaveAdmin() {
  const clave = azar_(4) + "-" + azar_(4) + "-" + azar_(4);
  PropertiesService.getScriptProperties().setProperty("ADMIN_HASH", hash_(clave, "ADMIN"));
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const h = ss.getSheetByName("Clave admin") || ss.insertSheet("Clave admin");
  h.clear();
  h.getRange(1, 1, 3, 2).setValues([["Tu clave del Panel del administrador:", clave],
    ["Generada:", new Date()], ["Importante:", "No la compartas. Para cambiarla: Extensiones > Apps Script > nuevaClaveAdmin > Ejecutar."]]);
  return clave;
}
