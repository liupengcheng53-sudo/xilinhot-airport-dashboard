/* ============================================================
 * 航班详情页 flight.js
 * 同一份 data/flights.json 驱动：
 *   1) 关联航班表格（行底色=status）
 *   2) 机位甘特图（stands[].occupancy → flightId 查色）
 * 二次修改：
 *   - 改颜色 → flights.json 的 statusColors / ganttBarColors
 *   - 改列 → renderTable 表头与字段映射
 *   - 改时间轴范围 → GANTT_START_HOUR / GANTT_HOURS
 * ============================================================ */
(function () {
  'use strict';

  var $ = null;
  var layer = null;
  var FL = null;

  // 甘特时间轴：当天 05:00 起共 24 小时（与协同共享平台截图接近）
  var GANTT_START_HOUR = 5;
  var GANTT_HOURS = 24;
  var PX_PER_HOUR = 56; // 每小时宽度，可调

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function updateClock() {
    var d = new Date();
    var wk = '日一二三四五六'[d.getDay()];
    var elT = document.getElementById('clock');
    var elD = document.getElementById('date');
    if (elT) elT.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    if (elD) elD.textContent = d.getFullYear() + '年' + pad(d.getMonth() + 1) + '月' + pad(d.getDate()) + '日 星期' + wk;
  }
  function fmtHM(iso) {
    if (!iso) return '--';
    var d = new Date(iso);
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function flightById(id) {
    for (var i = 0; i < FL.flights.length; i++) {
      if (FL.flights[i].id === id) return FL.flights[i];
    }
    return null;
  }

  /* ---------- 表格 ---------- */
  function renderTable() {
    var tb = document.querySelector('#flightMainTable tbody');
    if (!tb) return;
    var colors = FL.statusColors || {};
    var h = '';
    FL.flights.forEach(function (f, idx) {
      var meta = colors[f.status] || {};
      var rowClass = meta.rowClass || 'row-gray';
      var vip = f.vip ? '<span class="vip-star" title="VIP">★</span>' : '';
      h += '<tr class="' + rowClass + '" data-id="' + f.id + '">';
      h += '<td>' + (idx + 1) + '</td>';
      h += '<td>' + f.date + '</td>';
      h += '<td>' + f.gate + '</td>';
      h += '<td><span class="flight-code">' + f.flightIn + '</span> / <span class="flight-code">' + f.flightOut + '</span>' + vip + '</td>';
      h += '<td>' + f.aircraftType + '<br><small style="color:#8fb0c7">' + f.reg + '</small></td>';
      h += '<td>' + (f.standId || '-') + '</td>';
      h += '<td>' + fmtHM(f.sta) + ' / ' + fmtHM(f.ata) + '</td>';
      h += '<td>' + fmtHM(f.std) + ' / ' + fmtHM(f.atd) + '</td>';
      h += '<td>' + fmtHM(f.tobt) + '</td>';
      h += '<td>' + fmtHM(f.cobt) + '</td>';
      h += '<td>' + (f.statusText || meta.label || f.status) + '</td>';
      h += '</tr>';
    });
    tb.innerHTML = h;

    // 底部统计
    var meta = FL.meta || {};
    var setText = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
    setText('statTotal', meta.total || FL.flights.length);
    setText('statArr', meta.arrivals || '-');
    setText('statDep', meta.departures || '-');
  }

  /* ---------- 甘特 ---------- */
  function dayOrigin() {
    // 以 meta.date 的 GANTT_START_HOUR 为原点
    var dateStr = (FL.meta && FL.meta.date) ? FL.meta.date : '2026-10-09';
    return new Date(dateStr + 'T' + pad(GANTT_START_HOUR) + ':00:00');
  }
  function toOffsetPx(iso) {
    var origin = dayOrigin().getTime();
    var t = new Date(iso).getTime();
    var hours = (t - origin) / 3600000;
    return hours * PX_PER_HOUR;
  }

  function renderGantt() {
    var wrap = document.getElementById('ganttWrap');
    if (!wrap) return;
    var totalW = GANTT_HOURS * PX_PER_HOUR;
    var origin = dayOrigin();
    var barColors = FL.ganttBarColors || {};

    // 表头小时
    var thead = '<tr><th class="stand-col">机位</th>';
    for (var h = 0; h < GANTT_HOURS; h++) {
      var hour = (GANTT_START_HOUR + h) % 24;
      thead += '<th style="width:' + PX_PER_HOUR + 'px;min-width:' + PX_PER_HOUR + 'px">' + pad(hour) + ':00</th>';
    }
    thead += '</tr>';

    var tbody = '';
    (FL.stands || []).forEach(function (st) {
      if (st.disabled && !$('#chkShowDisabled').prop('checked')) return;
      tbody += '<tr data-stand="' + st.id + '"><td class="stand-col">' + st.name + (st.disabled ? ' 禁' : '') + '</td>';
      tbody += '<td colspan="' + GANTT_HOURS + '" style="padding:0;position:relative;height:36px;min-width:' + totalW + 'px;width:' + totalW + 'px">';
      // 背景竖线
      tbody += '<div style="position:relative;width:' + totalW + 'px;height:36px">';
      for (var i = 0; i < GANTT_HOURS; i++) {
        tbody += '<div style="position:absolute;left:' + (i * PX_PER_HOUR) + 'px;top:0;bottom:0;width:1px;background:rgba(0,231,255,.08)"></div>';
      }
      (st.occupancy || []).forEach(function (occ) {
        var f = flightById(occ.flightId);
        var status = f ? f.status : 'planned';
        var color = barColors[status] || '#6b7c93';
        var left = toOffsetPx(occ.start);
        var right = toOffsetPx(occ.end);
        var width = Math.max(24, right - left);
        var label = occ.label || (f ? (f.flightIn + '/' + f.flightOut) : occ.flightId);
        var vip = f && f.vip ? ' ★' : '';
        tbody += '<div class="gantt-bar" data-fid="' + occ.flightId + '" title="' + label + ' ' + fmtHM(occ.start) + '-' + fmtHM(occ.end) +
          '" style="left:' + left + 'px;width:' + width + 'px;background:' + color + '">' + label + vip + '</div>';
      });
      tbody += '</div></td></tr>';
    });

    wrap.innerHTML = '<table class="gantt-table"><thead>' + thead + '</thead><tbody>' + tbody + '</tbody></table>';

    // 当前时间线
    var now = new Date();
    var nowLeft = toOffsetPx(now.toISOString().slice(0, 19)); // 本地近似
    // 上面 toISOString 是 UTC，改用本地拼
    var localIso = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + 'T' +
      pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
    nowLeft = toOffsetPx(localIso);
    if (nowLeft >= 0 && nowLeft <= totalW) {
      var line = document.createElement('div');
      line.className = 'gantt-now';
      line.style.left = (70 + nowLeft) + 'px'; // 70≈机位列宽，视觉近似
      // 更稳妥：插到每行内容区——这里简化放在 wrap 绝对定位
      wrap.style.position = 'relative';
      // 改用表格内第一行内容区叠加：遍历 bars 父级
      var cells = wrap.querySelectorAll('tbody td[colspan]');
      cells.forEach(function (cell) {
        var nl = document.createElement('div');
        nl.className = 'gantt-now';
        nl.style.left = nowLeft + 'px';
        cell.querySelector('div').appendChild(nl);
      });
    }

    // 图例
    var leg = document.getElementById('ganttLegend');
    if (leg) {
      var lh = '';
      var sc = FL.statusColors || {};
      Object.keys(barColors).forEach(function (k) {
        var label = (sc[k] && sc[k].label) || k;
        lh += '<span><i style="background:' + barColors[k] + '"></i>' + label + '</span>';
      });
      leg.innerHTML = lh;
    }

    // 点击甘特条提示
    $(wrap).off('click', '.gantt-bar').on('click', '.gantt-bar', function () {
      var fid = $(this).data('fid');
      var f = flightById(fid);
      if (!f) return;
      layer.msg(f.flightIn + '/' + f.flightOut + ' · ' + f.statusText + ' · 机位 ' + f.standId, { time: 2000 });
    });
  }

  function bindUI() {
    $('.ftab').on('click', function () {
      var tab = $(this).data('tab');
      $('.ftab').removeClass('active');
      $(this).addClass('active');
      $('.flight-panel').removeClass('active');
      $('#panel-' + tab).addClass('active');
      if (tab === 'gantt') {
        // 切换后需要一次渲染（若尚未）
        renderGantt();
      }
    });
    $('#chkShowDisabled').on('change', function () { renderGantt(); });
    $('#btnExport').on('click', function () { Editable.exportJSON(); });
    $('#btnImport').on('click', function () { Editable.triggerImport(); });
    $('#flightMainTable').on('click', 'tr[data-id]', function () {
      var f = flightById($(this).data('id'));
      if (!f) return;
      layer.open({
        type: 1, title: f.flightIn + ' / ' + f.flightOut,
        skin: 'dept-skin', area: ['520px', 'auto'], shadeClose: true,
        content: '<div class="modal-box">' +
          '<div class="staff-row"><span class="rl">航线进</span><span class="sh">' + f.routeIn + '</span></div>' +
          '<div class="staff-row"><span class="rl">航线出</span><span class="sh">' + f.routeOut + '</span></div>' +
          '<div class="staff-row"><span class="rl">机型机号</span><span class="sh">' + f.aircraftType + ' / ' + f.reg + '</span></div>' +
          '<div class="staff-row"><span class="rl">机位/登机口</span><span class="sh">' + f.standId + ' / ' + f.gate + '</span></div>' +
          '<div class="staff-row"><span class="rl">状态</span><span class="sh">' + f.statusText + '</span></div>' +
          '<div class="staff-row"><span class="rl">STA/ATA</span><span class="sh">' + fmtHM(f.sta) + ' / ' + fmtHM(f.ata) + '</span></div>' +
          '<div class="staff-row"><span class="rl">STD/ATD</span><span class="sh">' + fmtHM(f.std) + ' / ' + fmtHM(f.atd) + '</span></div>' +
          '<div class="staff-row"><span class="rl">TOBT/COBT</span><span class="sh">' + fmtHM(f.tobt) + ' / ' + fmtHM(f.cobt) + '</span></div>' +
          '</div>'
      });
    });
  }

  function boot() {
    layui.use(['layer'], function () {
      layer = layui.layer;
      $ = layui.$;
      window.$ = $;
      Editable.init({ url: 'data/content.json' }).then(function () {
        return fetch('data/flights.json', { cache: 'no-store' }).then(function (r) { return r.json(); });
      }).then(function (json) {
        FL = json;
        renderTable();
        renderGantt();
        bindUI();
        updateClock();
        setInterval(updateClock, 1000);
      }).catch(function (e) {
        console.error(e);
        layer.msg('加载 flights.json 失败', { icon: 2 });
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
