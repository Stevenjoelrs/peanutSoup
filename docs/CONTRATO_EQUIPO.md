# **CONTRATO Y ACUERDO DE TRABAJO EN EQUIPO** 

**Materia:** Sistemas de Información 2 **Institución:** Universidad Mayor de San Simón (UMSS) **Proyecto:** Sistema Web para el Seguro Social Universitario (SSU - UMSS) **Alcance del Sistema:** Módulo Estudiantil y Módulo de Administración 

## **1. Integrantes y Horarios de Conexión** 

Dado que los 6 miembros del equipo cuentan con disponibilidades horarias heterogéneas, se establece una metodología de trabajo **asíncrona prioritaria** apoyada en puntos de encuentro sincrónicos obligatorios para la planificación y revisión de los incrementos del proyecto. 

|**Integrante**|**Rol Principal**|**Horario Habitual de**<br>**Trabajo**|**Sistema Operativo**|
|---|---|---|---|
|**Jose Armando**<br>**Figueredo Mancilla**|Product Owner /<br>Fullstack Developer /<br>QA|Flexible / Noches<br>(20:00 - 23:00)|Linux / Windows|
|**Steven Joel Ramos**<br>**Salazar**|Product Owner / DB<br>Admin / Backend / QA|Flexible / Tardes<br>(16:00 - 20:00)|Linux/macOS|
|**Joyce Angie**<br>**Fernández Quispe**|Product Owner /<br>Fullstack Developer /<br>QA|Flexible / Tardes<br>17:00 - 18:00|Linux/MacOS|
|**Camila Araoz Soliz**|Product Owner /<br>Fullstack Developer|Flexible / Noches<br>21:00 - 23:00|Windows|
|**Ximena Mendoza**<br>**Humerez**|Product Owner /<br>Frontend Developer|Flexible / Noches<br>21:00 - 23:00|Windows|



|**Integrante**|**Rol Principal**|**Horario Habitual de**<br>**Trabajo**|**Sistema Operativo**|
|---|---|---|---|
|**Wendy Puma Uribe**|Product Owner /<br>Backend Developer|Flexible / Tardes<br>15:00 - 18:00|Windows|



## **2. Compromisos y Reglas del Equipo** 

### **2.1. Puntualidad y Cumplimiento de Fechas (Deadlines)** 

- **Tolerancia:** Se establece una tolerancia máxima de **10 minutos** para las reuniones sincrónicas programadas. 

- **Notificación Previa:** En caso de indisponibilidad o choque de horarios, el integrante debe notificar al equipo en el canal oficial con al menos **2 horas de anticipación** . 

- **Congelamiento de Código (Code Freeze):** Las Historias de Usuario asignadas a un Sprint deben estar completadas, probadas e integradas **24 horas antes** de la fecha/hora de entrega dictada por la materia. 

### **2.2. Ceremonias y Comunicación Sincrónica/Asincrónica** 

- **Daily Asíncrono (Diario):** Cada miembro debe responder en el chat de comunicación oficial antes de las **22:00** el siguiente reporte: 

   1. ¿Qué avance se realizó en el módulo? 

   2. ¿Qué tarea se abordará a continuación? 

   3. ¿Existe algún bloqueo técnico con la base de datos, backend o interfaz? 

- **Sprint Review y Retrospectiva (Semanal):** Sesión fija los dias jueves de **30 a 45 minutos** para probar el funcionamiento del portal web, auditar los endpoints de la API y validar el flujo del estudiante y del administrador. 

## **3. Entorno Tecnológico y Versiones Oficiales Estables** 

Para asegurar la máxima compatibilidad y evitar fallos por entorno entre sistemas operativos diversos (Windows, macOS y Arch Linux), el equipo estandariza el stack tecnológico en sus versiones fijas gestionadas estrictamente con <mark>`pnpm` .</mark> 

|**Herramienta / Librería**|**Versión Estándar**|**Propósito y Notas Técnicas**|
|---|---|---|
|**Gestor de Paquetes**|pnpm v12.4.2|Instalaciones eficientes en<br>disco y bloqueo de<br>dependencias en<br>`pnpm-lock.yaml`.|
|**Entorno de Ejecución**|Node.js v24.x LTS|Uso de ejecución nativa,<br>soporte de `--watch` y<br>estabilidad en controladores<br>SQL.|
|**Vite**|8.3.0|Herramienta de construcción<br>rápida para el frontend. rapido<br>empaquetado y soporte nativo<br>para módulos modernos.|
|**Base de Datos Única**|Supabase (PostgreSQL 16)|Instancia Cloud administrada y<br>compartida por los 6<br>integrantes.|
|**Driver de Conexión DB**|pg v8.23.x|Conexión SQL directa<br>mediante `Pool` (sin ORM)<br>para consultas de alto<br>rendimiento.|
|**Framework / Seguridad**|express v5.2.x / helmet<br>v8.x/cors v2.8.x|Servidor web de APIs REST y<br>protección con cabeceras de<br>seguridad HTTP, y habilitación<br>de peticiones crossorigin entre<br>frontend y backend.|
|**Contenedorización / IDE**|Docker Engine / Visual Studio<br>Code|Homogeneización de entornos<br>de ejecución y extensiones de<br>código compartidas.|



**Configuración Oficial de Dependencias** **<mark>(</mark>** **<mark>`package.json` )</mark>** 

```
{
  "name": "ssu-umss-web",
  "version": "1.0.0",
  "description": "Sistema Web para el Seguro Social Universitario SSU - UMSS",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "license": "ISC",
  "dependencies": {
    "cors": "^2.8.6",
    "dotenv": "^16.6.1",
    "express": "^5.2.1",
    "helmet": "^8.3.0",
    "pg": "^8.23.0"
  }
}
```

## **4. Reglas de Base de Datos Única Cloud (Supabase)** 

1. **Instancia Centralizada:** Existe una única base de datos activa alojada en Supabase Cloud. Los 6 integrantes conectarán sus entornos locales a esta instancia mediante la variable <mark>`DATABASE`</mark> `_` <mark>`URL`</mark> configurada en su archivo <mark>`.env`</mark> personal. 

2. **Protección de Credenciales:** Queda estrictamente prohibido incluir o subir el archivo <mark>`.env`</mark> al repositorio de Git. 

3. **Gestión de Migraciones y DDL:** 

   - Queda prohibido alterar directamente el esquema de tablas desde la interfaz gráfica de Supabase sin consentimiento previo del equipo. 

   - Todo cambio estructural <mark>(</mark> <mark>`CREATE TABLE` ,</mark> <mark>`ALTER TABLE` ,</mark> restricciones) debe guardarse en scripts ordenados en la carpeta <mark>`/db/migrations/` .</mark> 

   - El **DB Admin** es el único responsable autorizado para ejecutar las migraciones finales en la nube. 

## **5. Flujo de Trabajo en Git y Control de Versiones** 

- **Estructura de Ramas:** 

   - <mark>`main` :</mark> Código probado, estable y listo para presentación académica. 

   - <mark>`develop` :</mark> Rama de integración continua donde se prueban las funcionalidades unificadas. 

   - <mark>`feature/us-afiliacion` ,</mark> <mark>`feature/us-citas-medicas` ,</mark> <mark>`feature/us-admin-panel` :</mark> Ramas de trabajo individual. 

### ● **Estructura de commits:** 

Cada commit debe empezar con un prefijo que indique su propósito, seguido de una descripción breve en minúsculas y en modo imperativo. 

   - feat: agrega el componente de barra de busqueda 

   - fix: corrige el desbordamiento de texto en las tarjetas 

   - chore: actualiza las dependencias de prisma 

- **Reglas de Pull Request (PR):** 

   - Prohibido realizar <mark>`push`</mark> o <mark>`merge`</mark> directo a <mark>`main` .</mark> 

   - Todo PR requiere la revisión y aprobación de al menos **1 integrante** encargado del Code Review. 

   - Ningún PR será aprobado si interrumpe la ejecución de <mark>`pnpm dev`</mark> o genera errores en la base de datos. 

## **6. Resolución de Conflictos y Sanciones** 

1. **Inasistencias e Incumplimiento:** Ante dos faltas injustificadas a las entregas de tareas o reuniones de revisión, se redistribuyen las Historias de Usuario y se notificará de forma oficial al Ingeniero de la materia. 

2. **Compatibilidad de Saltos de Línea (Cross-Platform):** Debido al uso mixto de Windows, macOS y Arch Linux, se exige configurar Git con finales de línea LF <mark>(</mark> <mark>`git config core.autocrlf input`</mark> o <mark>`true` )</mark> para evitar conflictos innecesarios en las diferencias de código. 

## **7. Firmas de Conformidad del Equipo** 

Al firmar este documento, los 6 miembros declaran su conformidad con las reglas, arquitectura de base de datos única y acuerdos establecidos para el desarrollo del proyecto. 



<!-- Start of picture text -->
Nombre Completo  C.I. / Código SIS<br>Jose Armando  202401604<br>Figueredo Mancilla<br>Joyce Angie  202408275<br>Ferńandez Quispe<br><!-- End of picture text -->

|**Nombre Completo**|**C.I. / Código SIS**|
|---|---|
|Steven Joel Ramos<br>Salazar|202103270|
|Camila Araoz Soliz|202304212|
|Wendy Puma Uribe|202400347|
|Ximena Mendoza<br>Humerez|202203290|



