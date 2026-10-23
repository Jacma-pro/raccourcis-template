import { api, escapeHtml as e } from './api.js';

const MODIFIERS = ['Control', 'Alt', 'Shift', 'Meta'];
const KEY_LABELS = {
  Enter: 'Entrée', Escape: 'Échap', ' ': 'Espace', Backspace: 'Retour arrière', Delete: 'Suppr',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
};

// Disposition réelle du clavier (AZERTY, QWERTY…), disponible sur Chrome et Edge.
let layoutMap = null;
navigator.keyboard?.getLayoutMap().then((map) => { layoutMap = map; }).catch(() => {});

// event.code désigne une position physique (la touche Z d'un AZERTY donne KeyW) :
// on le traduit avec la disposition réelle. Sans elle, event.key convient sauf avec Alt sur Mac (Alt + P donne « π »).
function letterFor(event) {
  return layoutMap?.get(event.code) ?? (/^[a-z]$/i.test(event.key) ? event.key : event.code.slice(3));
}

// Transforme un événement clavier en texte : « Ctrl + Maj + P ».
function describeKey(event) {
  const parts = [];
  if (event.ctrlKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Maj');
  if (event.metaKey) parts.push('Cmd');
  const main = /^Digit\d$/.test(event.code) ? event.code.slice(5)
    : /^Key[A-Z]$/.test(event.code) ? letterFor(event).toUpperCase()
    : KEY_LABELS[event.key] ?? (event.key.length === 1 ? event.key.toUpperCase() : event.key);
  return [...parts, main].join(' + ');
}

// « VS Code », « vscode » et « vs-code » doivent se valoir : minuscules, sans accents ni séparateurs.
const normalize = (text) => text.toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]|[^a-z0-9]/g, '');

// Liste de suggestions accessible (pattern ARIA « combobox ») pour réutiliser les catégories existantes.
function suggestCategories(input, categories) {
  const list = document.createElement('ul');
  list.id = 'category-options';
  list.className = 'suggestions';
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  input.after(list);
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', list.id);
  input.setAttribute('aria-expanded', 'false');
  let active = -1;

  const options = () => [...list.children];
  function close() {
    list.hidden = true;
    active = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }
  function highlight(index) {
    options().forEach((option, i) => option.setAttribute('aria-selected', String(i === index)));
    active = index;
    if (index >= 0) input.setAttribute('aria-activedescendant', options()[index].id);
    else input.removeAttribute('aria-activedescendant');
  }
  function choose(name) {
    input.value = name;
    close();
  }
  function open() {
    const query = normalize(input.value);
    const matches = categories.filter((name) => name !== input.value && normalize(name).includes(query));
    if (!matches.length) return close();
    list.innerHTML = matches.map((name, i) =>
      `<li role="option" id="category-option-${i}" aria-selected="false" data-name="${e(name)}">${e(name)}</li>`).join('');
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    highlight(-1);
  }

  input.addEventListener('input', open);
  input.addEventListener('focus', open);
  input.addEventListener('blur', close);
  // mousedown (et non click) : le blur de l'input fermerait la liste avant le clic.
  list.addEventListener('mousedown', (event) => {
    const option = event.target.closest('[role="option"]');
    if (!option) return;
    event.preventDefault();
    choose(option.dataset.name);
  });
  input.addEventListener('keydown', (event) => {
    if (list.hidden && event.key === 'ArrowDown') return open();
    if (list.hidden) return;
    const count = options().length;
    if (event.key === 'ArrowDown') highlight((active + 1) % count);
    else if (event.key === 'ArrowUp') highlight((active - 1 + count) % count);
    else if (event.key === 'Enter' && active >= 0) choose(options()[active].dataset.name);
    else if (event.key === 'Escape') close();
    else return;
    event.preventDefault();
  });
}

// Tab, Échap et Retour arrière seuls restent réservés à la navigation et à l'édition.
function captureKeys(input) {
  input.addEventListener('keydown', (event) => {
    if (MODIFIERS.includes(event.key)) return;
    const hasModifier = event.ctrlKey || event.altKey || event.metaKey;
    if (!hasModifier && event.key === 'Tab') return;
    event.preventDefault();
    if (!hasModifier && event.key === 'Escape') {
      input.form.elements.category.focus();
    } else if (!hasModifier && !event.shiftKey && ['Backspace', 'Delete'].includes(event.key)) {
      input.value = '';
    } else {
      input.value = describeKey(event);
    }
  });
}

export function showForm(app) {
  app.innerHTML = `
    <a class="back" href="#/">← Retour au sommaire</a>
    <p class="eyebrow">ENRICHIR LE CARNET</p><h1>Une astuce à partager ?</h1>
    <p class="intro">Remplissez les métadonnées, puis rédigez votre explication en Markdown. L’API créera le fichier pour vous.</p>
    <form id="shortcut-form" class="form">
      <div class="form-grid">
        <label>Titre<input name="title" required maxlength="120" placeholder="Ouvrir la palette de commandes" /></label>
        <label>Touches<input name="keys" required maxlength="120" placeholder="Appuyez sur votre raccourci" aria-describedby="keys-hint" autocomplete="off" /></label>
        <label>Catégorie<input name="category" required maxlength="60" placeholder="VS Code, navigateur, terminal…" autocomplete="off" /></label>
        <label>Description courte<input name="description" required maxlength="300" placeholder="Une phrase pour le sommaire" /></label>
      </div>
      <p id="keys-hint" class="hint">Dans « Touches », tapez directement le raccourci pour l’enregistrer. <kbd>Échap</kbd> ou <kbd>Tab</kbd> pour en sortir, <kbd>Retour arrière</kbd> pour effacer. Pour enregistrer l’un d’eux, ajoutez un modificateur (ex. Ctrl + Échap).</p>
      <label>Contenu Markdown<textarea name="content" required rows="12" spellcheck="true" placeholder="## À quoi sert ce raccourci ?"></textarea></label>
      <p class="hint">Pour une image : <code>![Description de l’image](https://exemple.org/image.png)</code>. Pour un lien : <code>[Texte](https://exemple.org)</code>.</p>
      <p id="form-error" role="alert" class="error"></p>
      <button class="button" type="submit">Créer le fichier Markdown →</button>
    </form>`;
  const form = document.querySelector('#shortcut-form');
  const button = form.querySelector('button');
  captureKeys(form.elements.namedItem('keys'));
  api().then((shortcuts) => {
    const categories = [...new Set(shortcuts.map((item) => item.category))].sort((a, b) => a.localeCompare(b, 'fr'));
    suggestCategories(form.elements.namedItem('category'), categories);
  }).catch(() => {}); // sans suggestions, le champ reste un simple champ texte
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
