/* ============================================================
 * 文案可点编模块（Editable Copy）
 * 用法：
 *   1. HTML 中给需要可编辑的文字加 class="ed" 和 data-k="键名"
 *   2. 调用 Editable.init()；会自动从 data/content.json 与 localStorage 合并
 *   3. 双击文案进入编辑；失焦或回车保存到 localStorage
 *   4. 工具栏按钮调用 Editable.exportJSON() / Editable.importJSON(file)
 * 二次修改提示：
 *   - 新增文案键：在 data/content.json 加字段，并在 HTML 用 data-k 引用
 *   - 清除本地修改：localStorage.removeItem('xilinhot_content_v1')
 * ============================================================ */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'xilinhot_content_v1';
  var content = {};          // 当前生效文案
  var defaults = {};         // 来自 content.json 的默认值

  /** 深度合并：local 覆盖 base */
  function merge(base, local) {
    var out = {};
    var k;
    for (k in base) { if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k]; }
    if (local) {
      for (k in local) { if (Object.prototype.hasOwnProperty.call(local, k)) out[k] = local[k]; }
    }
    return out;
  }

  /** 从 localStorage 读取用户改过的文案 */
  function loadLocal() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  /** 把当前 content 中「相对默认有变化」的键写入 localStorage */
  function saveLocal() {
    var diff = {};
    var k;
    for (k in content) {
      if (Object.prototype.hasOwnProperty.call(content, k) && content[k] !== defaults[k]) {
        diff[k] = content[k];
      }
    }
    // 也保留用户新增键
    localStorage.setItem(STORAGE_KEY, JSON.stringify(diff));
  }

  /** 把 content 应用到所有 [data-k] 节点 */
  function applyToDom() {
    var nodes = document.querySelectorAll('[data-k]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var key = el.getAttribute('data-k');
      if (key && content[key] != null) {
        // 若节点正在编辑则跳过
        if (el.getAttribute('contenteditable') === 'true') continue;
        el.textContent = content[key];
      }
    }
  }

  /** 给 .ed 节点绑定双击编辑 */
  function bindEditors() {
    document.addEventListener('dblclick', function (ev) {
      var el = ev.target.closest('.ed');
      if (!el) return;
      ev.preventDefault();
      ev.stopPropagation();
      startEdit(el);
    }, true);
  }

  function startEdit(el) {
    if (el.getAttribute('contenteditable') === 'true') return;
    el.setAttribute('contenteditable', 'true');
    el.focus();
    // 选中全部文字，方便直接覆盖
    try {
      var range = document.createRange();
      range.selectNodeContents(el);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) {}

    function finish() {
      el.removeAttribute('contenteditable');
      var key = el.getAttribute('data-k');
      var val = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (key) {
        content[key] = val;
        saveLocal();
      }
      el.removeEventListener('blur', finish);
      el.removeEventListener('keydown', onKey);
    }
    function onKey(e) {
      if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
      if (e.key === 'Escape') {
        // 还原
        var key = el.getAttribute('data-k');
        if (key && content[key] != null) el.textContent = content[key];
        el.removeAttribute('contenteditable');
        el.removeEventListener('blur', finish);
        el.removeEventListener('keydown', onKey);
      }
    }
    el.addEventListener('blur', finish);
    el.addEventListener('keydown', onKey);
  }

  /** 导出完整 content.json（默认 + 本地覆盖）并触发下载 */
  function exportJSON() {
    var blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'content.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
    if (global.layui && layui.layer) {
      layui.layer.msg('已导出 content.json', { icon: 1, time: 1500 });
    }
  }

  /** 从用户选择的文件导入并合并 */
  function importJSON(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var obj = JSON.parse(reader.result);
        content = merge(content, obj);
        // 导入的全部当作本地覆盖写入
        localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
        applyToDom();
        if (global.layui && layui.layer) {
          layui.layer.msg('文案已导入并保存', { icon: 1, time: 1500 });
        }
      } catch (e) {
        alert('导入失败：JSON 格式不正确');
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  /** 触发隐藏 file input */
  function triggerImport() {
    var input = document.getElementById('contentImportInput');
    if (!input) {
      input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.id = 'contentImportInput';
      input.style.display = 'none';
      input.addEventListener('change', function () {
        if (input.files && input.files[0]) importJSON(input.files[0]);
        input.value = '';
      });
      document.body.appendChild(input);
    }
    input.click();
  }

  /** 初始化：拉默认 JSON → 合并本地 → 应用到 DOM */
  function init(opts) {
    opts = opts || {};
    var url = opts.url || 'data/content.json';
    bindEditors();
    return fetch(url, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .catch(function () { return {}; })
      .then(function (json) {
        defaults = json || {};
        content = merge(defaults, loadLocal());
        applyToDom();
        return content;
      });
  }

  /** 读取某个键（脚本里动态拼文案时用） */
  function get(key, fallback) {
    return content[key] != null ? content[key] : fallback;
  }

  /** 设置某个键并刷新 DOM */
  function set(key, val) {
    content[key] = val;
    saveLocal();
    applyToDom();
  }

  global.Editable = {
    init: init,
    exportJSON: exportJSON,
    importJSON: importJSON,
    triggerImport: triggerImport,
    get: get,
    set: set,
    applyToDom: applyToDom,
    getAll: function () { return content; }
  };
})(window);
