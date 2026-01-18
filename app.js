/*
 * 短歌帳アプリのクライアントサイドロジック
 *
 * このファイルでは、ローカルストレージを利用して短歌データと連作データを
 * 保存・読み込みし、各種ビュー（入力、一覧、カレンダー、連作、プレビュー）を
 * 更新するための処理を実装します。
 */

// グローバルデータ
let tankaEntries = [];
let seriesList = [];
let currentPreview = null;
let editingEntryId = null; // 現在編集中の短歌ID (新規作成時はnull)
let currentSeriesEditing = null; // デッキ編集中の連作ID

// 要素の取得
const navButtons = document.querySelectorAll('.nav-btn');
const sections = document.querySelectorAll('.section');

const tankaForm = document.getElementById('tanka-form');
// 短歌入力テキストエリア（5行まとめて）
const tankaText = document.getElementById('tanka-text');
const tagsInput = document.getElementById('tags');
const categoryInput = document.getElementById('category');
const seriesSelect = document.getElementById('series-select');
const addSeriesBtn = document.getElementById('add-series-btn');
const newSeriesForm = document.getElementById('new-series-form');
const newSeriesNameInput = document.getElementById('new-series-name');
const newSeriesPlanInput = document.getElementById('new-series-plan');
const createSeriesBtn = document.getElementById('create-series');
const memoInput = document.getElementById('memo');
const resetFormBtn = document.getElementById('reset-form');

// List section elements
const searchKeyInput = document.getElementById('search-key');
const filterTagInput = document.getElementById('filter-tag');
const filterCategoryInput = document.getElementById('filter-category');
const filterStatusSelect = document.getElementById('filter-status');
const filterBtn = document.getElementById('filter-btn');
const exportBtn = document.getElementById('export-btn');
const importFileInput = document.getElementById('import-file');
const tankaTableBody = document.querySelector('#tanka-table tbody');

// Card container
const cardContainer = document.getElementById('card-container');

// Calendar & series section elements
const calendarContainer = document.getElementById('calendar');
const seriesListContainer = document.getElementById('series-list');

// Deck builder elements
const deckBuilder = document.getElementById('deck-builder');
const deckEntryList = document.getElementById('deck-entry-list');
const deckSaveBtn = document.getElementById('deck-save-btn');
const deckCancelBtn = document.getElementById('deck-cancel-btn');

// Preview section elements
const fontSelect = document.getElementById('font-select');
const colorSelect = document.getElementById('color-select');
const backgroundSelect = document.getElementById('background-select');
const previewArea = document.getElementById('preview-area');
const generateImageBtn = document.getElementById('generate-image');

/**
 * 初期化処理
 */
function init() {
  loadData();
  updateSeriesSelect();
  renderList();
  renderSeriesList();
  attachEventListeners();
}

/**
 * ローカルストレージからデータを読み込む
 */
function loadData() {
  const entriesJSON = localStorage.getItem('tankaEntries');
  tankaEntries = entriesJSON ? JSON.parse(entriesJSON) : [];
  const seriesJSON = localStorage.getItem('seriesList');
  seriesList = seriesJSON ? JSON.parse(seriesJSON) : [];
}

/**
 * データをローカルストレージへ保存
 */
function saveData() {
  localStorage.setItem('tankaEntries', JSON.stringify(tankaEntries));
  localStorage.setItem('seriesList', JSON.stringify(seriesList));
}

/**
 * シリーズセレクトボックスを更新
 */
function updateSeriesSelect() {
  // clear existing options except the first default
  while (seriesSelect.options.length > 1) {
    seriesSelect.remove(1);
  }
  seriesList.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    seriesSelect.appendChild(opt);
  });
}

/**
 * イベントリスナーを設定
 */
function attachEventListeners() {
  // ナビゲーションボタン
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      navButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.id.replace('nav-', '') + '-section';
      sections.forEach(sec => {
        if (sec.id === target) {
          sec.classList.add('active-section');
        } else {
          sec.classList.remove('active-section');
        }
      });
      // セクション切替時の再描画
      if (target === 'list-section') renderList();
      if (target === 'series-section') renderSeriesList();
    });
  });

  // 文字数カウント: 5行入力を1つのテキストエリアに変更したため不要

  // 連作追加ボタン
  addSeriesBtn.addEventListener('click', () => {
    newSeriesForm.classList.toggle('hidden');
  });
  // 新規連作作成
  createSeriesBtn.addEventListener('click', () => {
    const name = newSeriesNameInput.value.trim();
    if (!name) return;
    const plan = parseInt(newSeriesPlanInput.value);
    const id = 'series-' + Date.now();
    seriesList.push({ id, name, planCount: isNaN(plan) ? 0 : plan, entries: [] });
    saveData();
    updateSeriesSelect();
    renderSeriesList();
    newSeriesNameInput.value = '';
    newSeriesPlanInput.value = '';
    newSeriesForm.classList.add('hidden');
  });

  // フォーム送信
  tankaForm.addEventListener('submit', e => {
    e.preventDefault();
    handleFormSubmission();
  });

  // フォームリセット
  resetFormBtn.addEventListener('click', () => {
    resetForm();
  });

  // 検索・フィルタ
  filterBtn.addEventListener('click', () => {
    renderList();
  });

  // エクスポート
  exportBtn.addEventListener('click', () => {
    exportCSV();
  });

  // インポート
  importFileInput.addEventListener('change', handleImport);

  // プレビューコントロール
  fontSelect.addEventListener('change', () => updatePreview());
  colorSelect.addEventListener('change', () => updatePreview());
  backgroundSelect.addEventListener('change', () => updatePreview());
  generateImageBtn.addEventListener('click', () => {
    generateImage();
  });
}

/**
 * 文字数を数える（句読点や空白を含む単純な文字数）
 * 将来音数を考慮する実装に置き換え可能
 */
function getCharLength(str) {
  if (!str) return 0;
  return Array.from(str.trim()).length;
}

/**
 * フォーム送信時の処理
 */
function handleFormSubmission() {
  // collect lines from single textarea
  const rawLines = tankaText.value.split(/\r?\n/).map(l => l.trim());
  // ignore empty entry
  if (rawLines.every(line => line === '')) {
    alert('少なくとも一行は入力してください');
    return;
  }
  // Ensure at least 5 lines by padding with空文字
  const lines = rawLines.slice(0, 5);
  while (lines.length < 5) {
    lines.push('');
  }
  const tags = tagsInput.value.split(',').map(t => t.trim()).filter(t => t);
  const category = categoryInput.value.trim();
  const seriesId = seriesSelect.value;
  const memo = memoInput.value.trim();
  let entry;
  let isNew = false;
  if (editingEntryId) {
    // 既存のエントリを更新
    entry = tankaEntries.find(e => e.id === editingEntryId);
    if (!entry) {
      console.warn('編集対象のエントリが見つかりません');
      return;
    }
    // 古いシリーズから削除
    if (entry.seriesId && entry.seriesId !== seriesId) {
      const oldSeries = seriesList.find(s => s.id === entry.seriesId);
      if (oldSeries) {
        oldSeries.entries = oldSeries.entries.filter(eid => eid !== entry.id);
      }
    }
    // 更新
    entry.lines = lines;
    entry.tags = tags;
    entry.category = category;
    entry.seriesId = seriesId || '';
    entry.memo = memo;
    // 日付は変更しない
  } else {
    // 新規エントリ作成
    const id = 'tanka-' + Date.now();
    const date = new Date().toISOString();
    entry = {
      id,
      date,
      lines,
      tags,
      category,
      seriesId: seriesId || '',
      memo,
      status: 'unpublished'
    };
    tankaEntries.push(entry);
    isNew = true;
  }
  // 新しいシリーズに追加
  if (seriesId) {
    const series = seriesList.find(s => s.id === seriesId);
    if (series && !series.entries.includes(entry.id)) {
      series.entries.push(entry.id);
    }
  }
  saveData();
  renderList();
  // カレンダー機能は削除したため再描画不要
  renderSeriesList();
  // プレビューを更新
  currentPreview = entry;
  updatePreview();
  // リセット
  resetForm();
  editingEntryId = null;
  // プレビュータブへ遷移
  document.getElementById('nav-preview').click();
}

/**
 * フォームを初期状態に戻す
 */
function resetForm() {
  // 5行一括入力に対応: テキストエリアをクリア
  if (tankaText) tankaText.value = '';
  tagsInput.value = '';
  categoryInput.value = '';
  seriesSelect.value = '';
  memoInput.value = '';
  editingEntryId = null;
}

/**
 * 一覧ビューを生成
 */
function renderList() {
  // Clear table body
  tankaTableBody.innerHTML = '';
  // Clear card container
  cardContainer.innerHTML = '';
  // Filter entries based on search/filter
  const keyword = searchKeyInput.value.trim();
  const filterTag = filterTagInput.value.trim();
  const filterCategory = filterCategoryInput.value.trim();
  const filterStatus = filterStatusSelect.value;
  let filtered = [...tankaEntries];
  if (keyword) {
    filtered = filtered.filter(e => e.lines.some(l => l.includes(keyword)) || e.memo.includes(keyword));
  }
  if (filterTag) {
    const tagLower = filterTag.toLowerCase();
    filtered = filtered.filter(e => e.tags.some(t => t.toLowerCase().includes(tagLower)));
  }
  if (filterCategory) {
    const catLower = filterCategory.toLowerCase();
    filtered = filtered.filter(e => (e.category || '').toLowerCase().includes(catLower));
  }
  if (filterStatus) {
    filtered = filtered.filter(e => e.status === filterStatus);
  }
  // Sort by date desc
  filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
  // Render rows
  filtered.forEach(entry => {
    const tr = document.createElement('tr');
    tr.dataset.id = entry.id;
    const dateTd = document.createElement('td');
    dateTd.textContent = formatDate(entry.date);
    const lineTd = document.createElement('td');
    lineTd.textContent = entry.lines[0] || '';
    const tagTd = document.createElement('td');
    tagTd.textContent = entry.tags.join(', ');
    const catTd = document.createElement('td');
    catTd.textContent = entry.category || '';
    const seriesTd = document.createElement('td');
    const seriesName = entry.seriesId ? (seriesList.find(s => s.id === entry.seriesId)?.name || '') : '';
    seriesTd.textContent = seriesName;
    tr.append(dateTd, lineTd, tagTd, catTd, seriesTd);
    tr.addEventListener('click', () => {
      // 編集モードへ
      editEntry(entry);
    });
    tankaTableBody.appendChild(tr);

    // create card with full poem displayed vertically
    const card = document.createElement('div');
    card.classList.add('card');
    card.dataset.id = entry.id;
    // poem container with vertical writing
    const poemDiv = document.createElement('div');
    poemDiv.classList.add('card-poem');
    // Escape HTML and join lines with <br>
    poemDiv.innerHTML = entry.lines.map(l => escapeHTML(l)).join('<br>');
    card.appendChild(poemDiv);
    // info container for date and tags (horizontal)
    const infoDiv = document.createElement('div');
    infoDiv.classList.add('card-info');
    const dateEl = document.createElement('div');
    dateEl.classList.add('date');
    dateEl.textContent = formatDate(entry.date);
    infoDiv.appendChild(dateEl);
    const tagsEl = document.createElement('div');
    tagsEl.classList.add('tags');
    tagsEl.textContent = entry.tags.join(', ');
    infoDiv.appendChild(tagsEl);
    card.appendChild(infoDiv);
    card.addEventListener('click', () => {
      editEntry(entry);
    });
    cardContainer.appendChild(card);
  });
}

/**
 * 日付を日本のローカルフォーマットに変換
 */
function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });
}

/**
 * カレンダーを描画
 */
function renderCalendar() {
  // カレンダーセクションが削除されている場合は何もしない
  if (!calendarContainer) return;
  calendarContainer.innerHTML = '';
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekDay = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  // Fill blanks for previous month days
  for (let i = 0; i < startWeekDay; i++) {
    const blank = document.createElement('div');
    blank.classList.add('day');
    calendarContainer.appendChild(blank);
  }
  // Days of current month
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month, d);
    const isoDate = dateObj.toISOString().split('T')[0];
    const entriesOnDay = tankaEntries.filter(e => e.date.startsWith(isoDate));
    const dayDiv = document.createElement('div');
    dayDiv.classList.add('day');
    const numSpan = document.createElement('div');
    numSpan.classList.add('day-number');
    numSpan.textContent = d;
    dayDiv.appendChild(numSpan);
    if (entriesOnDay.length > 0) {
      const countSpan = document.createElement('div');
      countSpan.classList.add('count');
      countSpan.textContent = entriesOnDay.length + '首';
      dayDiv.appendChild(countSpan);
    }
    dayDiv.addEventListener('click', () => {
      if (entriesOnDay.length > 0) {
        alert(entriesOnDay.map(e => e.lines.join('\n')).join('\n\n'));
      }
    });
    calendarContainer.appendChild(dayDiv);
  }
}

/**
 * 連作リストを描画
 */
function renderSeriesList() {
  seriesListContainer.innerHTML = '';
  // シリーズリストを再描画する際にデッキ編集モーダルを強制的に閉じる
  // 過去に開いていた場合、ページ遷移後も表示されたままとなるバグを防ぐ
  if (deckBuilder) {
    // 編集モーダルを閉じる
    deckBuilder.classList.add('hidden');
    deckBuilder.style.display = 'none';
  }
  currentSeriesEditing = null;
  seriesList.forEach(series => {
    const item = document.createElement('div');
    item.classList.add('series-item');
    const nameSpan = document.createElement('span');
    nameSpan.textContent = series.name;
    const progressSpan = document.createElement('span');
    const count = series.entries.length;
    const plan = series.planCount;
    progressSpan.classList.add('progress');
    progressSpan.textContent = plan > 0 ? `${count}/${plan} 首` : `${count} 首`;
    item.appendChild(nameSpan);
    item.appendChild(progressSpan);
    // デッキ編集ボタン
    const editBtn = document.createElement('button');
    editBtn.classList.add('deck-edit-btn');
    editBtn.textContent = 'デッキ編集';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openDeckBuilder(series.id);
    });
    item.appendChild(editBtn);
    seriesListContainer.appendChild(item);
  });
}

/**
 * エントリを編集モードでフォームへ設定
 */
function editEntry(entry) {
  editingEntryId = entry.id;
  // 設定：短歌テキストエリアに行をまとめてセット
  if (tankaText) {
    tankaText.value = entry.lines.join('\n');
  }
  tagsInput.value = entry.tags.join(', ');
  categoryInput.value = entry.category || '';
  seriesSelect.value = entry.seriesId || '';
  memoInput.value = entry.memo || '';
  currentPreview = entry;
  updatePreview();
  // 入力タブへ
  document.getElementById('nav-input').click();
}

/**
 * デッキビルダーを開く
 */
function openDeckBuilder(seriesId) {
  currentSeriesEditing = seriesId;
  deckEntryList.innerHTML = '';
  const series = seriesList.find(s => s.id === seriesId);
  if (!series) return;
  // リスト作成
  tankaEntries.forEach(entry => {
    const card = document.createElement('div');
    card.classList.add('deck-card');
    card.dataset.id = entry.id;
    if (series.entries.includes(entry.id)) {
      card.classList.add('selected');
    }
    const title = document.createElement('div');
    title.classList.add('title');
    title.textContent = entry.lines[0] || '(無題)';
    const dateEl = document.createElement('div');
    dateEl.classList.add('date');
    dateEl.textContent = formatDate(entry.date);
    card.appendChild(title);
    card.appendChild(dateEl);
    card.addEventListener('click', () => {
      card.classList.toggle('selected');
    });
    deckEntryList.appendChild(card);
  });
  // モーダルを表示
  deckBuilder.classList.remove('hidden');
  deckBuilder.style.display = 'flex';
}

// デッキ保存ボタン
deckSaveBtn.addEventListener('click', () => {
  if (!currentSeriesEditing) return;
  const series = seriesList.find(s => s.id === currentSeriesEditing);
  if (!series) return;
  const selectedIds = [];
  deckEntryList.querySelectorAll('.deck-card.selected').forEach(card => {
    selectedIds.push(card.dataset.id);
  });
  series.entries = selectedIds;
  saveData();
  renderSeriesList();
  // モーダルを閉じる
  deckBuilder.classList.add('hidden');
  deckBuilder.style.display = 'none';
  currentSeriesEditing = null;
});

// デッキキャンセルボタン
deckCancelBtn.addEventListener('click', () => {
  // モーダルを閉じる
  deckBuilder.classList.add('hidden');
  deckBuilder.style.display = 'none';
  currentSeriesEditing = null;
  // シリーズリストを再描画してイベントリスナーをリセット
  renderSeriesList();
});

/**
 * デッキ編集の保存処理。onclick から呼び出せるようにグローバル関数として定義。
 */
function saveDeck() {
  if (!currentSeriesEditing) return;
  const series = seriesList.find(s => s.id === currentSeriesEditing);
  if (!series) return;
  const selectedIds = [];
  deckEntryList.querySelectorAll('.deck-card.selected').forEach(card => {
    selectedIds.push(card.dataset.id);
  });
  series.entries = selectedIds;
  saveData();
  renderSeriesList();
  deckBuilder.classList.add('hidden');
  deckBuilder.style.display = 'none';
  currentSeriesEditing = null;
}

/**
 * デッキ編集のキャンセル処理。onclick から呼び出せるようにグローバル関数として定義。
 */
function cancelDeck() {
  deckBuilder.classList.add('hidden');
  deckBuilder.style.display = 'none';
  currentSeriesEditing = null;
  renderSeriesList();
}

// グローバルに公開
window.saveDeck = saveDeck;
window.cancelDeck = cancelDeck;

/**
 * プレビューエリアを更新
 */
function updatePreview() {
  // Clear previous content
  previewArea.innerHTML = '';
  if (!currentPreview) return;
  // Set classes and styles
  previewArea.className = '';
  previewArea.classList.add('vertical');
  // Background
  const bg = backgroundSelect.value;
  if (bg === 'paper') {
    previewArea.style.backgroundImage = "url('background.png')";
    previewArea.style.backgroundColor = 'transparent';
  } else if (bg === 'white') {
    previewArea.style.backgroundImage = 'none';
    previewArea.style.backgroundColor = '#ffffff';
  } else {
    // beige default
    previewArea.style.backgroundImage = 'none';
    previewArea.style.backgroundColor = '#faf6f0';
  }
  // Font and color
  previewArea.style.fontFamily = fontSelect.value;
  previewArea.style.color = colorSelect.value;
  // Create vertical text content using ruby tags if future furigana support
  const p = document.createElement('p');
  p.style.margin = '0';
  // Combine lines with <br>
  // For each line we can wrap in span; for now simple concatenation with <br>
  p.innerHTML = currentPreview.lines.map(l => escapeHTML(l)).join('<br>');
  previewArea.appendChild(p);
}

/**
 * HTMLエスケープ
 */
function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 画像を生成してダウンロード
 */
function generateImage() {
  if (!currentPreview) return;
  html2canvas(previewArea).then(canvas => {
    const link = document.createElement('a');
    link.download = 'tanka.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  });
}

/**
 * CSV出力
 */
function exportCSV() {
  const header = ['id','date','line1','line2','line3','line4','line5','tags','category','seriesId','memo','status'];
  const rows = tankaEntries.map(e => {
    const tagsStr = e.tags.join(';');
    return [e.id, e.date, ...e.lines, tagsStr, e.category || '', e.seriesId || '', e.memo || '', e.status].join(',');
  });
  const csvContent = [header.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'tanka_entries.csv';
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * CSV読み込み
 */
function handleImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const text = e.target.result;
    importCSV(text);
  };
  reader.readAsText(file);
}

/**
 * CSVを安全にパースするユーティリティ関数。
 *
 * 引用符に囲まれた値にカンマや改行が含まれていても正しく分割します。
 * 2連続の引用符 "" はエスケープされた1文字の引用符として扱います。
 *
 * @param {string} text CSV形式の文字列
 * @returns {string[][]} 行ごとのセル配列
 */
function parseCSV(text) {
  const rows = [];
  let current = '';
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (current) {
      current += '\n' + line;
    } else {
      current = line;
    }
    const quoteCount = (current.match(/"/g) || []).length;
    if (quoteCount % 2 === 0) {
      rows.push(current);
      current = '';
    }
  }
  if (current) rows.push(current);
  return rows.map(row => {
    const cells = [];
    let cell = '';
    let insideQuote = false;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '"') {
        if (insideQuote && row[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          insideQuote = !insideQuote;
        }
      } else if (ch === ',' && !insideQuote) {
        cells.push(cell);
        cell = '';
      } else {
        cell += ch;
      }
    }
    cells.push(cell);
    return cells;
  });
}

function importCSV(text) {
  const rows = parseCSV(text);
  if (!rows || rows.length <= 1) return;
  const header = rows[0];
  // 57577アプリの短歌ファイル
  if (header[0] === '短歌' && header.includes('メモ')) {
    const nowPrefix = Date.now().toString();
    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i];
      if (!cols || cols.length === 0 || cols.every(c => c === '')) continue;
      const poem = cols[0] || '';
      const memo = cols[1] || '';
      const labels = cols[2] || '';
      const created = cols[3] || '';
      const updated = cols[4] || '';
      const completed = cols[5] || '';
      const id = 'import-' + nowPrefix + '-' + i;
      let date = created || updated || '';
      if (date) {
        const m = date.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
        if (m) {
          const y = m[1];
          const month = m[2].padStart(2, '0');
          const day = m[3].padStart(2, '0');
          date = `${y}-${month}-${day}`;
        }
      }
      const lineArr = poem.split(/\r?\n/);
      while (lineArr.length < 5) {
        lineArr.push('');
      }
      const tags = [];
      if (labels) {
        labels.split(/[,;\s、]+/).forEach(t => {
          const trimmed = t.trim();
          if (trimmed) tags.push(trimmed);
        });
      }
      const status = completed && completed.trim() && completed.trim() !== '(未完成)' ? 'published' : 'unpublished';
      if (tankaEntries.find(e => e.id === id)) continue;
      const entry = {
        id,
        date,
        lines: lineArr.slice(0, 5),
        tags,
        category: '',
        seriesId: '',
        memo,
        status
      };
      tankaEntries.push(entry);
    }
  } else if (header[0] === '連作名' && header.includes('説明')) {
    // 57577アプリの連作ファイル
    const nowPrefix = Date.now().toString();
    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i];
      if (!cols || cols.length === 0 || cols.every(c => c === '')) continue;
      const seriesName = cols[0] || '';
      const created = cols[2] || '';
      const updated = cols[3] || '';
      const seriesId = 'series-' + nowPrefix + '-' + i;
      const series = { id: seriesId, name: seriesName || seriesId, planCount: 0, entries: [] };
      for (let j = 4; j < cols.length; j++) {
        const poemCell = cols[j];
        if (poemCell && poemCell.trim()) {
          const entryId = 'import-' + seriesId + '-' + (j - 3);
          let date = created || updated || '';
          // 連作CSVの作成日・更新日はYYYY-MM-DD形式
          if (date) {
            const m = date.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
            if (m) {
              const y = m[1];
              const month = m[2].padStart(2, '0');
              const day = m[3].padStart(2, '0');
              date = `${y}-${month}-${day}`;
            }
          }
          const lineArr = poemCell.split(/\r?\n/);
          while (lineArr.length < 5) {
            lineArr.push('');
          }
          const entry = {
            id: entryId,
            date,
            lines: lineArr.slice(0, 5),
            tags: [],
            category: '',
            seriesId,
            memo: '',
            status: 'unpublished'
          };
          tankaEntries.push(entry);
          series.entries.push(entryId);
        }
      }
      seriesList.push(series);
    }
  } else {
    // 当アプリ独自フォーマット
    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i];
      if (!cols || cols.length === 0 || cols.every(c => c === '')) continue;
      const id = cols[0];
      const date = cols[1];
      const linesArr = cols.slice(2, 7);
      const tagsStr = cols[7] || '';
      const category = cols[8] || '';
      const seriesId = cols[9] || '';
      const memo = cols[10] || '';
      const status = cols[11] || 'unpublished';
      if (tankaEntries.find(e => e.id === id)) continue;
      const entry = {
        id,
        date,
        lines: linesArr,
        tags: tagsStr ? tagsStr.split(';').map(t => t.trim()).filter(t => t) : [],
        category,
        seriesId,
        memo,
        status
      };
      tankaEntries.push(entry);
      if (seriesId) {
        let series = seriesList.find(s => s.id === seriesId);
        if (!series) {
          series = { id: seriesId, name: seriesId, planCount: 0, entries: [] };
          seriesList.push(series);
        }
        series.entries.push(id);
      }
    }
  }
  saveData();
  renderList();
  // カレンダー機能は不要のため再描画せず
  renderSeriesList();
  alert('CSV読み込みが完了しました');
}

// ページ読み込み時に初期化
document.addEventListener('DOMContentLoaded', init);