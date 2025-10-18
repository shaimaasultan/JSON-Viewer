let originalData = [];
let selectedColumns = [];
let sortState = {
  column: null,
  direction: 'asc'
};
let isPivotMode = false;
let columnFilters = {}; // key: column name, value: filter string
let flatFilters = {
  key: '',
  value: ''
};

function debounce(fn, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

document.getElementById('jsonFileInput').addEventListener('change', function (event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    const rawText = e.target.result;
    originalData = parseLogEntries(rawText);

    document.getElementById('lineCountDisplay').textContent =
      `Parsed ${originalData.length} log entries`;

    if (originalData.length > 0) {
      renderColumnSelector(Object.keys(originalData[0]));
    }

    renderTable();
  };
  reader.readAsText(file);
});



document.getElementById('pivotButton').addEventListener('click', function () {
  isPivotMode = !isPivotMode;
  this.textContent = isPivotMode ? 'Switch to Flat View' : 'Switch to Pivot View';

  //const query = document.getElementById('searchInput').value.toLowerCase();
  //const mode = document.getElementById('searchMode').value;

  renderTable();
});

function renderTable() {
  if (isPivotMode) {
    renderPivotTable(originalData);
  } else {
    const flattened = flattenEntries(originalData);
    renderFlatTable(flattened);
  }
}

function parseLogEntries(text) {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  const entries = [];

  lines.forEach(line => {
    try {
      const obj = JSON.parse(line);
      entries.push(obj);
    } catch (err) {
      // skip malformed lines
    }
  });

  return entries;
}

function recursivelySplitValue(value, parentKey = '') {
  const result = {};

  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === 'object' && parsed !== null) {
      return flattenNestedObject(parsed, parentKey);
    }
  } catch (err) {
    // not JSON
  }

  const parts = value.includes(',') ? value.split(',') : [value];
  parts.forEach((part, i) => {
    const key = parentKey || `value_${i}`;
    result[key] = part.trim();
  });

  return result;
}

function flattenNestedObject(obj, prefix = '') {
  const result = {};

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}_${key}` : key;

    if (typeof value === 'object' && value !== null) {
      Object.assign(result, flattenNestedObject(value, fullKey));
    } else {
      result[fullKey] = String(value);
    }
  }

  return result;
}

function flattenEntries(entries) {
  const flat = {};

  entries.forEach(entry => {
    Object.entries(entry).forEach(([key, value]) => {
      const flattened =
        typeof value === 'object' && value !== null
          ? flattenNestedObject(value, key)
          : { [key]: String(value) };

      Object.entries(flattened).forEach(([flatKey, flatValue]) => {
        if (!flat[flatKey]) flat[flatKey] = [];
        flat[flatKey].push(flatValue);
      });
    });
  });

  return flat;
}

function renderFlatTable(data) {
  const container = document.getElementById('tableContainer');
  container.innerHTML = '';

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');

  // Header row
  const headerRow = document.createElement('tr');
  ['Key', 'Value'].forEach((text, index) => {
    const th = document.createElement('th');
    const column = index === 0 ? 'key' : 'value';

    let icon = '';
    if (sortState.column === column) {
      icon = sortState.direction === 'asc' ? ' ▲' : ' ▼';
    }

    th.innerHTML = `${text}${icon}`;
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      sortState.direction = (sortState.column === column && sortState.direction === 'asc') ? 'desc' : 'asc';
      sortState.column = column;
      renderFlatTable(data);
    });

    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  // Filter row
  const filterRow = document.createElement('tr');
  ['key', 'value'].forEach(column => {
    const td = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = `Filter ${column}`;
    input.style.width = '100%';
    input.style.boxSizing = 'border-box';
    input.style.backgroundColor = 'black';
    input.style.color = 'gold';
    input.style.border = '1px solid gold';
    input.value = flatFilters[column] || '';

    input.addEventListener('input', () => {
      flatFilters[column] = input.value.toLowerCase(); // only update state
    });

    td.appendChild(input);
    filterRow.appendChild(td);
  });
  tbody.appendChild(filterRow);

  // Flatten rows
  let rows = [];
  Object.entries(data).forEach(([key, values]) => {
    values.forEach(value => {
      rows.push({ key, value: String(value) });
    });
  });

  // Apply filters manually
  rows = rows.filter(({ key, value }) => {
    const keyMatch = !flatFilters.key || key.toLowerCase().includes(flatFilters.key);
    const valueMatch = !flatFilters.value || value.toLowerCase().includes(flatFilters.value);
    return keyMatch && valueMatch;
  });

  // Apply sorting
  if (sortState.column) {
    rows.sort((a, b) => {
      const aVal = a[sortState.column].toLowerCase();
      const bVal = b[sortState.column].toLowerCase();
      return sortState.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
  }

  // Render rows
  rows.forEach(({ key, value }) => {
    const row = document.createElement('tr');
    const keyCell = document.createElement('td');
    const valueCell = document.createElement('td');

    keyCell.innerHTML =highlightMatch(key, flatFilters.key);
    valueCell.innerHTML = highlightMatch(value, flatFilters.value);


    row.appendChild(keyCell);
    row.appendChild(valueCell);
    tbody.appendChild(row);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  container.appendChild(table);
}

document.getElementById('clearFiltersBtn').addEventListener('click', () => {
  // Clear pivot filters
  Object.keys(columnFilters).forEach(key => columnFilters[key] = '');

  // Clear flat filters
  flatFilters.key = '';
  flatFilters.value = '';

  // Re-render current view
  renderTable();
});

document.getElementById('applyFiltersBtn').addEventListener('click', () => {
  renderPivotTable(originalData); // apply filters manually
  renderTable();
});

function renderPivotTable(entries) {
  const container = document.getElementById('tableContainer');
  container.innerHTML = '';

  if (!entries.length) return;

  const keys = selectedColumns.length ? selectedColumns : Object.keys(entries[0]);

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');

  // Header row (sortable)
  const headerRow = document.createElement('tr');
  keys.forEach(key => {
    const th = document.createElement('th');
    th.style.cursor = 'pointer';

    let icon = '';
    if (sortState.column === key) {
      icon = sortState.direction === 'asc' ? ' ▲' : ' ▼';
    }

    th.innerHTML = `${key}${icon}`;
    th.addEventListener('click', () => {
      sortState.direction = (sortState.column === key && sortState.direction === 'asc') ? 'desc' : 'asc';
      sortState.column = key;
      renderPivotTable(entries);
    });

    headerRow.appendChild(th);
  });

  // Filter row (styled inputs)
  const filterRow = document.createElement('tr');
  keys.forEach(key => {
    const td = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = `Filter ${key}`;
    input.style.width = '100%';
    input.style.boxSizing = 'border-box';
    input.style.backgroundColor = 'black';
    input.style.color = 'gold';
    input.style.border = '1px solid gold';
    input.dataset.key = key;

    input.value = columnFilters[key] || '';

    input.addEventListener('input', () => {
    columnFilters[key] = input.value.toLowerCase(); // just update state
    });
      td.appendChild(input);
      filterRow.appendChild(td);
    });

  thead.appendChild(headerRow);
  tbody.appendChild(filterRow); // 👈 moved to tbody for cleaner layout

  // Apply filters
  let filteredEntries = entries.filter(entry => {
    return Object.entries(columnFilters).every(([key, filter]) => {
      if (!filter) return true;
      const value = String(entry[key] ?? '').toLowerCase();
      return value.includes(filter);
    });
  });

  // Apply sorting
  if (sortState.column) {
    filteredEntries.sort((a, b) => {
      const aVal = String(a[sortState.column] ?? '').toLowerCase();
      const bVal = String(b[sortState.column] ?? '').toLowerCase();
      return sortState.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
  }

  // Render rows
  filteredEntries.forEach(entry => {
    const row = document.createElement('tr');
    keys.forEach(key => {
      const td = document.createElement('td');
      const value = entry[key] !== undefined ? String(entry[key]) : '';
      td.innerHTML = highlightMatch(value, columnFilters[key]);
      row.appendChild(td);
    });
    tbody.appendChild(row);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  container.appendChild(table);
}

function renderColumnSelector(keys) {
  const container = document.getElementById('columnSelectorContainer');
  container.innerHTML = '<strong>Show Columns:</strong><br>';

  keys.forEach(key => {
    const label = document.createElement('label');
    label.style.marginRight = '10px';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = key;
    checkbox.checked = true;

    checkbox.addEventListener('change', () => {
      selectedColumns = Array.from(container.querySelectorAll('input:checked')).map(cb => cb.value);
      // const query = document.getElementById('searchInput').value.toLowerCase();
      // const mode = document.getElementById('searchMode').value;

      renderTable();
    });

    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(` ${key}`));
    container.appendChild(label);
  });

  selectedColumns = [...keys];
}

function highlightMatch(text, filter) {
  if (!filter) return text;
  const escaped = filter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  return text.replace(regex, '<span class="highlight">$1</span>');
}


function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}