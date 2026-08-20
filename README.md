# Budget Dashboard

Replica web della dashboard Power BI personale, con frontend JavaScript/ECharts e API server-side tramite Cloudflare Pages Functions.

## Architettura

`Google Sheets privato -> Cloudflare Pages Function /api/finance -> dashboard ECharts`

Il repository contiene **solo codice**: i movimenti finanziari non devono essere committati su GitHub.

## Pagine

- Andamento Mensile
- Cash Flow Netto
- Media Mensile
- Obiettivo di risparmio

## Classificazione provvisoria

Spese fisse: `mutuo`, `bollette`, `asilo`, `pulizie`, `assicurazione`, `spese condominiali`.
Tutte le altre categorie non-investimento sono trattate come variabili. Modifica `src/config.js` per correggerle.

Il target di risparmio provvisorio è 20%.

## Build locale

```bash
npm run build
```

Senza le variabili Google configurate, `/api/finance` non restituisce dati.

## Cloudflare Pages

Importa il repository GitHub come progetto Pages.

- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: `/`

La cartella `functions/` resta alla root ed espone automaticamente `/api/finance` come Pages Function.

### Secrets / variabili richieste

Nel progetto Pages configura per Production (e Preview se vuoi):

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_SHEET_ID`

`GOOGLE_PRIVATE_KEY` deve contenere la private key PEM del service account; può essere incollata con newline reali oppure con `\\n`.

### Google Cloud / Sheets

1. Crea un progetto Google Cloud.
2. Abilita **Google Sheets API**.
3. Crea un **Service Account**.
4. Crea una chiave JSON del service account.
5. Prendi `client_email` -> `GOOGLE_SERVICE_ACCOUNT_EMAIL`.
6. Prendi `private_key` -> `GOOGLE_PRIVATE_KEY`.
7. Condividi il Google Sheet con il `client_email` del service account in sola lettura.
8. Copia l'ID del foglio dall'URL -> `GOOGLE_SHEET_ID`.

La Function legge:

- `Conto!A:D`
- `Entrate!A:C`

Deriva anno e mese dalla data reale e ignora la colonna `anno`.

## Sicurezza

Non mettere mai la chiave del service account in `src/`, nel browser o nel repository. Le credenziali restano nelle Secrets/Environment variables di Cloudflare.
