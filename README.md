# GalleryWeb statico

Portfolio fotografico **senza PHP e senza database**: gratuito su GitHub Pages, modificabile da browser con [Pages CMS](https://pagescms.org) (login con GitHub).

- `content/` contiene le pagine (`sections/*.json`) e le impostazioni (`settings.json`).
- `site/` contiene i file statici (CSS, JS, icone) e le foto in `site/uploads/`.
- `build.mjs` genera il sito in `dist/`. GitHub Actions lo esegue a ogni modifica e pubblica il risultato.

## 1. Migrare il sito attuale

1. Dal vecchio pannello apri **Backup** (`admin/backup_export.php`) e salva il file JSON.
2. Scarica la cartella `uploads/` dal vecchio hosting (File Manager o FTP di InfinityFree) e copia le foto in `site/uploads/`.
3. Importa il backup:
   ```
   npm install
   npm run import -- percorso\del\backup.json --replace
   ```
   Lo script elenca le foto che mancano ancora in `site/uploads/`.
4. Anteprima locale: `npm run build` e poi `npm run serve` (http://localhost:8080/).

Il backup non contiene le password, né l'account admin: l'accesso al pannello ora è il tuo account GitHub.

## 2. Pubblicare su GitHub Pages

1. Crea un repository su GitHub (anche privato) e carica questa cartella (`git init`, `git add .`, `git commit`, `git push`).
2. Nel repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Il workflow *Pubblica il sito* parte da solo. L'indirizzo sarà `https://TUONOME.github.io/NOME-REPO/`.

Nota: i repository privati usano Pages solo con piani GitHub a pagamento; per restare gratis lascia il repository **pubblico** (non ci sono segreti: tutto il sito è comunque pubblico).

## 3. Modificare i contenuti

Vai su https://app.pagescms.org, accedi con GitHub e scegli il repository. Da lì puoi:
- creare e modificare pagine e sezioni, riordinare i blocchi (testo, galleria, immagine, citazione, video, separatore);
- caricare foto (finiscono in `site/uploads/`);
- cambiare titolo, colori, social e footer in **Impostazioni del sito**.

Ogni salvataggio fa un commit e il sito si aggiorna in circa un minuto.

## Note

- Il nome di una pagina (nome del file) diventa l'indirizzo: `shooting-estate.json` → `/shooting-estate/`. Usa solo minuscole, numeri e trattini.
- Le pagine con *Pubblicata* disattivato non vengono generate (equivalgono alle vecchie bozze).
- Il testo dei blocchi viene sanificato in fase di generazione, come nel vecchio sito.
- Se vuoi un dominio tuo, basta aggiungerlo in Settings → Pages.
