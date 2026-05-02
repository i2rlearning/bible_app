// 1. Switch from 'style' to 'class' (This stops the inline style conflicts)
const Size = Quill.import('attributors/class/size');
Size.whitelist = ['8px', '10px', '12px', '14px', '16px', '18px', '24px', '32px'];
Quill.register(Size, true);

const toolbarOptions = [
  [{ size: Size.whitelist }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ color: [] }, { background: [] }],
  [{ list: 'ordered' }, { list: 'bullet' }, { list: 'check' }],
  [{ align: [] }],
  [{ script: 'sub' }, { script: 'super' }],
  [{ indent: '-1' }, { indent: '+1' }],
  [{ direction: 'rtl' }],
  ['link', 'image'],
  ['clean']
];

const quill = new Quill('#editor', {
  placeholder: 'Notes...',
  theme: 'snow',
  modules: { toolbar: toolbarOptions }
});

const toolbar = quill.getModule('toolbar');

// ----------------------------------------------------
// Formatting Logic (CLEANED UP)
// ----------------------------------------------------
// We no longer manually run quill.format('size', '14px') here.
// The CSS handles the 16px default automatically.

// ----------------------------------------------------
// Tooltips & UI
// ----------------------------------------------------
const sizeSelect = toolbar?.container.querySelector('select.ql-size');
if (sizeSelect) {
  sizeSelect.setAttribute('title', 'Change Font Size');
  // We do NOT dispatch a 'change' event here anymore.
  // We let the picker sit at its default state.
}

// Simple Tooltips
const btnTitles = {
  'ql-bold': 'Bold',
  'ql-italic': 'Italic',
  'ql-underline': 'Underline',
  'ql-strike': 'Strikethrough',
  'ql-link': 'Insert Link',
  'ql-image': 'Insert Image',
  'ql-direction': 'Text Direction',
  'ql-clean': 'Clear Format'
};

Object.keys(btnTitles).forEach(cls => {
  toolbar.container.querySelector(`button.${cls}`)?.setAttribute('title', btnTitles[cls]);
});

// Selectors (Align, Color, BG, Lists, Indent)
toolbar.container.querySelector('select.ql-align')?.parentElement.setAttribute('title', 'Align Text');
toolbar.container.querySelector('.ql-picker.ql-color')?.setAttribute('title', 'Font Color');
toolbar.container.querySelector('.ql-picker.ql-background')?.setAttribute('title', 'Background Color');
toolbar.container.querySelector('button.ql-list[value="ordered"]')?.setAttribute('title', 'Ordered List');
toolbar.container.querySelector('button.ql-list[value="bullet"]')?.setAttribute('title', 'Bullet List');
toolbar.container.querySelector('button.ql-list[value="check"]')?.setAttribute('title', 'Checkbox List');
toolbar.container.querySelector('button.ql-indent[value="-1"]')?.setAttribute('title', 'Outdent');
toolbar.container.querySelector('button.ql-indent[value="+1"]')?.setAttribute('title', 'Indent');
toolbar.container.querySelector('button.ql-script[value="sub"]')?.setAttribute('title', 'Subscript');
toolbar.container.querySelector('button.ql-script[value="super"]')?.setAttribute('title', 'Superscript');
