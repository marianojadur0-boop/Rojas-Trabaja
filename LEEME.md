# ROJAS TRABAJA — Cómo ponerla en línea

Todo es gratis. Hacé la primera vez desde una **computadora** (son unos 30 minutos en total). Después se maneja sola, y lo poco que haya que mirar se puede ver desde el celular.

Usá **un Gmail del proyecto** (por ejemplo `rojastrabaja@gmail.com`) tanto para GitHub como para Google. Así no queda atado a nadie en particular.

---

## Qué hace la web
- **Ofertas reales desde el primer minuto.** Get on Board se lee en vivo y Himalayas llega con el robot. Solo se muestran ofertas de los **últimos 7 días**, sin repetidas.
- **Las empresas publican gratis.** La oferta aparece al instante y vence sola a los 7 días.
- **Las personas se postulan desde la web**, con su CV en PDF. **Solo la empresa de esa oferta** ve los datos, entrando con su ID y su código.
- **"Busco trabajo".** Cada persona deja su perfil y su CV. El público solo ve datos anónimos: puesto, rubro, localidad y rango de edad. **Nombre, contacto y CV los ven únicamente las empresas verificadas.**
- **Autogestión.** Cada uno recibe un **ID y un código** para renovar o dar de baja lo suyo.
- **Panel del administrador.** Solo entrás vos, con tu clave, y tiene gráficos por zona, rango de edad, rubro y actividad.
- **Más portales.** Accesos directos a Computrabajo, Bumeran, ZonaJobs, LinkedIn, Indeed, Jooble, Opcionempleo, Portal Empleo y Facebook.

## Seguridad y privacidad (ya incluidas)
- Los datos personales y los CVs **nunca son públicos**. Los CVs se guardan en una carpeta **privada** de tu Google Drive.
- Las empresas **piden acceso** y vos las **aprobás** desde el panel. Si alguna usa mal los datos, le quitás el acceso con un toque.
- **Borrado automático todas las noches.** Los perfiles vencidos (30 días) y las postulaciones viejas (60 días) pierden nombre, contacto y CV. Solo quedan números anónimos para las estadísticas.
- Al dar de baja un perfil, sus datos y su CV se borran **en el momento**.
- Los códigos y tu clave se guardan **cifrados**. Después de varios intentos fallidos, el sistema se bloquea por una hora.
- Hay filtro contra estafas: se rechazan avisos con cobros o "inversión inicial". Una publicación con 3 denuncias se oculta sola.
- Hay protección contra envíos automáticos (robots) y contra código malicioso en los textos.

---

## Paso 1 · Subir la web a GitHub
1. Descomprimí el ZIP en la computadora.
2. Creá una cuenta gratis en https://github.com con el Gmail del proyecto.
3. Arriba a la derecha tocá **+ → New repository**. Nombre: `rojas-trabaja`, marcá **Public** y tocá **Create repository**.
4. Tocá **uploading an existing file** y arrastrá **todo lo que hay dentro** de la carpeta descomprimida (archivos y carpetas). Tocá **Commit changes**.
5. Revisá que se haya subido la carpeta `.github`: empieza con punto y a veces la compu la oculta. Si no está, tocá **Add file → Create new file**, escribí como nombre `.github/workflows/actualizar.yml`, pegá el contenido de ese archivo y tocá **Commit changes**.

## Paso 2 · Encender la web
1. En el proyecto: **Settings → Pages**.
2. En **Branch** elegí `main` y la carpeta `/ (root)`. Tocá **Save**.
3. Esperá 1 o 2 minutos. Tu web queda en **`https://TU-USUARIO.github.io/rojas-trabaja`**.
4. Permití que el robot guarde las ofertas nuevas: **Settings → Actions → General → Workflow permissions → Read and write permissions → Save**.

## Paso 3 · Conectar la base de datos privada (Google)
1. Entrá a https://sheets.new con el Gmail del proyecto y ponele de nombre **Rojas Trabaja – Base**.
2. Menú **Extensiones → Apps Script**.
3. Borrá lo que aparece, pegá **todo** el contenido de `backend/Codigo.gs` y tocá el disquete (**Guardar**).
4. Arriba, en el selector de funciones, elegí **instalar** y tocá **Ejecutar**. Google pide permisos: **Revisar permisos → tu cuenta → Configuración avanzada → Ir a (no seguro) → Permitir**. Es seguro: el script es tuyo y solo usa esta planilla y una carpeta privada de tu Drive.
5. Volvé a la planilla. Se crearon las hojas Ofertas, Perfiles, Postulaciones, Empresas, Busquedas y **Clave admin**. En **Clave admin** está **tu clave del panel**. Anotala y no la compartas.
6. En Apps Script tocá **Implementar → Nueva implementación → engranaje → Aplicación web**.
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier persona**
   - Tocá **Implementar** y copiá la **URL de la aplicación web** (termina en `/exec`).
7. En GitHub abrí `config.js`, tocá el **lápiz**, pegá la URL entre las comillas de `API_URL` y tocá **Commit changes**.

En 1 o 2 minutos todos los formularios quedan funcionando.

## Paso 4 · Probar que todo ande
1. **Robot:** en GitHub, **Actions → Actualizar ofertas → Run workflow**. En un minuto aparece un tilde verde. Después corre solo todos los días a las 6:00.
2. **Oferta de prueba:** publicá una desde la web, mirá que aparezca en "Rojas y zona" y después dala de baja con su ID y su código.
3. **Panel:** entrá a `https://TU-USUARIO.github.io/rojas-trabaja/#admin` y poné tu clave. También hay un link "Administración" abajo de todo en la web.

---

## Compartir en redes sociales
- **WhatsApp:** copiá el link de tu web y mandalo en chats, grupos o tu estado. Texto sugerido:
  > Ya está **Rojas Trabaja** Ofertas de empleo de la zona de los últimos 7 días, gratis. ¿Buscás trabajo? Dejá tu perfil. ¿Tenés un comercio? Publicá tu búsqueda: https://TU-USUARIO.github.io/rojas-trabaja
- **Facebook / Instagram:** publicá el link. En Instagram ponelo en la **biografía** o en una **historia con sticker de enlace**, porque el link en el texto de una publicación no se puede tocar.
- **Grupos locales:** compartilo en los grupos de Facebook de Rojas, Pergamino, Junín, Salto y Colón, y pedile al municipio o a la Oficina de Empleo que lo difundan.
- **Link más corto (opcional):** podés achicarlo gratis en https://tinyurl.com, o más adelante comprar un dominio propio tipo `rojastrabaja.com.ar` y conectarlo en **Settings → Pages → Custom domain**.

---

## Tu tarea como administrador (5 minutos por semana, desde el celular)
1. Entrá al panel (`…/#admin`) y **aprobá las empresas nuevas**. Antes de aprobar, verificá que sean reales (podés buscar el CUIT en https://www.afip.gob.ar o llamarlas).
2. Mirá los gráficos para saber qué se busca y dónde.
3. Una vez por mes, entrá a GitHub → **Actions** y fijate que haya tildes verdes. Si el proyecto pasa 60 días sin cambios, GitHub pausa el robot: se reactiva con **Run workflow**.

## Si algo se complica
- **Olvidé mi clave del panel:** Apps Script → función **nuevaClaveAdmin** → **Ejecutar**. La clave nueva aparece en la hoja **Clave admin**.
- **Hay que borrar algo a mano:** borrá la fila en la planilla.
- **Cambié `Codigo.gs`:** **Implementar → Gestionar implementaciones → lápiz → Versión: Nueva versión → Implementar**. Así la URL no cambia.
- **Quiero que las empresas entren sin aprobación:** en `Codigo.gs` cambiá `AUTO_APROBAR_EMPRESAS = false` por `true`. No es recomendable, porque protege menos los datos de las personas.

## Opcional · Más ofertas de la zona con Jooble
1. Pedí una clave gratis en https://ar.jooble.org/api/about
2. En GitHub: **Settings → Secrets and variables → Actions → New repository secret**. Nombre: `JOOBLE_KEY`, valor: tu clave.
   La clave gratuita trae 500 consultas en total y el robot usa una por día.
