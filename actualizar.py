"""
ROJAS TRABAJA - Robot de actualización diaria de ofertas.

Junta ofertas de fuentes autorizadas, quita duplicadas, borra las de más de
7 días y guarda el resultado en data/ofertas.json (lo que lee la web).

Fuentes:
  - Formulario propio (Google Forms -> Google Sheets publicado como CSV)  [FORM_CSV_URL]
  - Jooble Argentina (API oficial, requiere clave gratuita)                [JOOBLE_KEY]
  - Himalayas (API pública de empleos remotos, con atribución)
  - Get on Board (API pública, empleos tech de Latinoamérica)

Solo usa la biblioteca estándar de Python: no hay que instalar nada.
"""
import csv, io, json, os, re, sys, unicodedata, urllib.request
from datetime import datetime, timedelta, timezone

DIAS = 7
AHORA = datetime.now(timezone.utc)
LIMITE = AHORA - timedelta(days=DIAS)
SALIDA = os.path.join(os.path.dirname(__file__), "..", "data", "ofertas.json")
ZONA = ["Rojas", "Pergamino", "Junín", "Salto", "Colón", "Arrecifes", "Chacabuco",
        "Rafael Obligado", "Carabelas", "Los Indios", "Hunter", "La Beba", "Sol de Mayo"]
# Filtro de calidad: empresas o palabras que no queremos mostrar (se puede ampliar)
EXCLUIR_EMPRESAS = ["micro1"]
EXCLUIR_PALABRAS = ["co-founder", "cofounder", "co founder", "mlm", "multinivel"]
UA = {"User-Agent": "RojasTrabaja/1.0 (portal comunitario de empleo)"}
log = lambda *a: print(*a, file=sys.stderr)


def pedir(url, data=None, headers=None):
    h = dict(UA, **(headers or {}))
    req = urllib.request.Request(url, data=data, headers=h)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8")


def limpio(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def rubro_de(texto):
    t = limpio(texto)
    reglas = [("Agro", "agro campo rural tractor cosecha silo"), ("Salud", "salud enfermer medic clinica"),
              ("Gastronomía", "cocina mozo gastronom chef"), ("Comercio y ventas", "venta sales vendedor comercial cajer"),
              ("Atención al cliente", "support soporte customer atencion"), ("Administración", "admin contab finance account rrhh"),
              ("Diseño y marketing", "design diseno marketing content"), ("Transporte", "chofer logistic transporte"),
              ("Industria", "operario industria produccion soldador electric")]
    for r, claves in reglas:
        if any(c in t for c in claves.split()):
            return r
    return "Tecnología"


def oferta(**k):
    k.setdefault("primer_empleo", False)
    k.setdefault("modalidad", "Presencial")
    k["rubro"] = k.get("rubro") or rubro_de(k["titulo"])
    return k


# ---------- Fuentes ----------
def formulario_propio():
    url = os.environ.get("FORM_CSV_URL")
    if not url:
        return []
    filas = csv.DictReader(io.StringIO(pedir(url)))
    out = []
    for f in filas:
        f = {limpio(k).replace(" ", "_"): (v or "").strip() for k, v in f.items()}
        if limpio(f.get("aprobado", "si")) not in ("si", "s", "x", "ok", "1", "true"):
            continue  # moderación: solo se publican las aprobadas
        try:
            fecha = datetime.strptime(f.get("marca_temporal", "")[:19], "%d/%m/%Y %H:%M:%S").replace(tzinfo=timezone(timedelta(hours=-3)))
        except ValueError:
            continue
        out.append(oferta(titulo=f.get("puesto"), empresa=f.get("empresa"), localidad=f.get("localidad"),
                          rubro=f.get("rubro"), fecha=fecha.isoformat(), fuente="Publicada en Rojas Trabaja",
                          url=f.get("contacto", ""), descripcion=f.get("descripcion", "")[:300],
                          primer_empleo=limpio(f.get("primer_empleo")).startswith("si")))
    return out


def jooble():
    key = os.environ.get("JOOBLE_KEY")
    if not key:
        return []
    # Ojo: la clave gratuita tiene un cupo total de 500 consultas. 1 por día alcanza ~16 meses.
    body = json.dumps({"keywords": "", "location": "Rojas, Buenos Aires", "radius": "80"}).encode()
    d = json.loads(pedir(f"https://ar.jooble.org/api/{key}", body, {"Content-Type": "application/json"}))
    out = []
    for j in d.get("jobs", []):
        loc = j.get("location", "")
        out.append(oferta(titulo=j.get("title"), empresa=j.get("company") or "Empresa reservada",
                          localidad=next((z for z in ZONA if limpio(z) in limpio(loc)), loc or "Zona Rojas"),
                          fecha=j.get("updated"), fuente="Jooble", url=j.get("link"),
                          descripcion=re.sub("<[^>]+>", "", j.get("snippet", ""))[:300]))
    return out


def himalayas():
    out = []
    for p in (1, 2, 3):
        d = json.loads(pedir(f"https://himalayas.app/jobs/api/search?country=AR&sort=recent&page={p}"))
        for j in d.get("jobs", []):
            out.append(oferta(titulo=j["title"], empresa=j.get("companyName"), localidad="Remoto",
                              modalidad="Remoto", fecha=datetime.fromtimestamp(j["pubDate"], timezone.utc).isoformat(),
                              fuente="Himalayas", url=j.get("applicationLink") or j.get("guid"),
                              descripcion=(j.get("excerpt") or "")[:300],
                              rubro=rubro_de(j["title"] + " " + " ".join(j.get("categories", [])[:3])),
                              primer_empleo="Entry-level" in (j.get("seniority") or [])))
    return out


def getonboard():
    out = []
    for q in ("remoto", "argentina", "trainee", "junior"):
        d = json.loads(pedir(f"https://www.getonbrd.com/api/v0/search/jobs?query={q}&per_page=50"))
        for j in d.get("data", []):
            a = j["attributes"]
            remoto = a.get("remote") or a.get("remote_modality") in ("fully_remote", "remote_local")
            if not (remoto or "Argentina" in (a.get("countries") or [])):
                continue
            sen = (a.get("seniority") or {}).get("data", {}).get("id", 9)
            out.append(oferta(titulo=a["title"], empresa="Empresa en Get on Board",
                              localidad="Remoto" if remoto else "Argentina", modalidad="Remoto" if remoto else "Presencial",
                              fecha=datetime.fromtimestamp(a["published_at"], timezone.utc).isoformat(),
                              fuente="Get on Board", url=j["links"]["public_url"], rubro="Tecnología",
                              descripcion=re.sub("<[^>]+>", " ", a.get("description") or "")[:300].strip(),
                              primer_empleo=sen <= 1))
    return out


# ---------- Proceso ----------
def main():
    todas, estado = [], {}
    for nombre, fn in [("Formulario propio", formulario_propio), ("Jooble", jooble),
                       ("Himalayas", himalayas), ("Get on Board", getonboard)]:
        try:
            r = fn(); todas += r; estado[nombre] = len(r)
        except Exception as e:  # si una fuente falla, las demás siguen
            estado[nombre] = f"error: {e}"; log(nombre, e)
    total = len(todas)

    vigentes = []
    for o in todas:
        try:
            f = datetime.fromisoformat(str(o["fecha"]).replace("Z", "+00:00"))
            if f.tzinfo is None: f = f.replace(tzinfo=timezone.utc)
        except Exception:
            continue
        texto = limpio(o.get("titulo")) + " " + limpio(o.get("empresa"))
        if any(limpio(e) == limpio(o.get("empresa")) for e in EXCLUIR_EMPRESAS) or any(limpio(p) in texto for p in EXCLUIR_PALABRAS):
            continue
        if f >= LIMITE and o.get("titulo") and o.get("url"):
            o["fecha"] = f.isoformat(); vigentes.append(o)
    vencidas = total - len(vigentes)

    vistas, unicas = set(), []
    for o in sorted(vigentes, key=lambda o: o["fecha"], reverse=True):
        clave = (limpio(o["titulo"]), limpio(o["empresa"]), limpio(o["localidad"]))
        if clave in vistas or o["url"] in vistas:
            continue
        vistas.update([clave, o["url"]]); unicas.append(o)

    res = {"actualizado": AHORA.isoformat(), "dias": DIAS, "fuentes": estado,
           "resumen": {"encontradas": total, "vencidas_quitadas": vencidas,
                       "duplicadas_quitadas": len(vigentes) - len(unicas), "publicadas": len(unicas)},
           "ofertas": unicas}
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    with open(SALIDA, "w", encoding="utf-8") as fh:
        json.dump(res, fh, ensure_ascii=False, indent=1)
    log(json.dumps(res["resumen"], ensure_ascii=False), estado)


if __name__ == "__main__":
    main()
