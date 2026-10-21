import { api } from './api.js';

export function showForm(app) {
  app.innerHTML = `
    <a class="back" href="#/">← Retour au sommaire</a>
    <p class="eyebrow">ENRICHIR LE CARNET</p><h1>Une astuce à partager ?</h1>
    <p class="intro">Remplissez les métadonnées, puis rédigez votre explication en Markdown. L’API créera le fichier pour vous.</p>
    <form id="shortcut-form" class="form">
      <div class="form-grid">
        <label>Titre<input name="title" required maxlength="120" placeholder="Ouvrir la palette de commandes" /></label>
        <label>Touches<input name="keys" required maxlength="120" placeholder="Ctrl + Maj + P" /></label>
        <label>Catégorie<input name="category" required maxlength="60" placeholder="VS Code, navigateur, terminal…" /></label>
        <label>Description courte<input name="description" required maxlength="300" placeholder="Une phrase pour le sommaire" /></label>
      </div>
      <label>Contenu Markdown<textarea name="content" required rows="12" spellcheck="true" placeholder="## À quoi sert ce raccourci ?"></textarea></label>
      <p class="hint">Pour une image : <code>![Description de l’image](https://exemple.org/image.png)</code>. Pour un lien : <code>[Texte](https://exemple.org)</code>.</p>
      <p id="form-error" role="alert" class="error"></p>
      <button class="button" type="submit">Créer le fichier Markdown →</button>
    </form>`;
  const form = document.querySelector('#shortcut-form');
  const button = form.querySelector('button');
  const errorMessage = document.querySelector('#form-error');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorMessage.textContent = '';
    button.disabled = true;
    button.textContent = 'Création…';
    try {
      const data = Object.fromEntries(new FormData(form));
      const shortcut = await api('', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      location.hash = `/raccourci/${encodeURIComponent(shortcut.slug)}`;
    } catch (error) {
      errorMessage.textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = 'Créer le fichier Markdown →';
    }
  });
}
