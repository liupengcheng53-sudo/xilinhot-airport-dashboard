/* ============================================================
 * 首屏主逻辑 app.js
 * 依赖：layui（layer/$）、echarts、jquery、editable.js
 * 二次修改入口：
 *   - 改面板数据 → data/*.json
 *   - 改弹窗结构 → openXxxModal 函数
 *   - 改图表样式 → buildXxxChart 内 option
 * ============================================================ */
(function () {
  'use strict';

  var $ = null;               // layui.$
  var layer = null;
  var charts = {};            // echarts 实例缓存
  var DATA = {};              // 各 mock 数据缓存

  /* ---------- 工具 ---------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function windClass(speed) {
    // 风速告警：12–15 黄，>15 红
    if (speed > 15) return 'wind-red';
    if (speed >= 12) return 'wind-yellow';
    return '';
  }
  function fetchJSON(path) {
    return fetch(path, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .catch(function () { return null; });
  }
  function regChart(id, option) {
    var dom = document.getElementById(id);
    if (!dom) return null;
    var c = echarts.init(dom, null, { renderer: 'canvas' });
    c.setOption(option);
    charts[id] = c;
    return c;
  }
  function resizeCharts() {
    Object.keys(charts).forEach(function (k) {
      try { charts[k].resize(); } catch (e) {}
    });
  }

  /* ---------- 时钟 ---------- */
  function updateClock() {
    var d = new Date();
    var wk = '日一二三四五六'[d.getDay()];
    var elT = document.getElementById('clock');
    var elD = document.getElementById('date');
    if (elT) elT.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    if (elD) elD.textContent = d.getFullYear() + '年' + pad(d.getMonth() + 1) + '月' + pad(d.getDate()) + '日 星期' + wk;
  }

  /* ---------- 左1：在场人数 + 部门柱图 ---------- */
  function renderLeft1(p) {
    if (!p) return;
    var totalEl = document.getElementById('onSiteTotal');
    if (totalEl) totalEl.textContent = p.totalOnSite;
    var names = p.departments.map(function (d) { return d.name; });
    var vals = p.departments.map(function (d) { return d.online; });
    var chart = regChart('chartDept', {
      tooltip: {
        trigger: 'axis',
        confine: true,
        backgroundColor: 'rgba(4,18,40,.94)',
        borderColor: 'rgba(0,231,255,.45)',
        textStyle: { color: '#e6f7ff', fontSize: 12 }
      },
      grid: { left: '3%', right: '4%', bottom: '2%', top: '18%', containLabel: true },
      xAxis: {
        type: 'category', data: names,
        axisLabel: { color: '#8fb0c7', fontSize: 10, rotate: 20 },
        axisLine: { lineStyle: { color: 'rgba(0,231,255,.3)' } },
        axisTick: { show: false }
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: '#8fb0c7', fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(0,231,255,.12)' } },
        axisLine: { show: false }
      },
      series: [{
        type: 'bar', data: vals, barWidth: '45%',
        itemStyle: {
          borderRadius: [4, 4, 0, 0],
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#00e7ff' }, { offset: 1, color: '#1890ff' }
          ])
        }
      }]
    });
    // 点击柱体只开对应部门。标记放在原生 click 冒泡之前，避免面板再开一层。
    if (chart) {
      chart.off('click');
      chart.on('click', function (params) {
        chart.__deptBarClick = true;
        chart.dispatchAction({ type: 'hideTip' });
        var raw = params.event && params.event.event;
        if (raw && raw.stopPropagation) raw.stopPropagation();
        openDeptModal(params.name);
      });
    }
  }

  /** 左1 大弹窗：部门 → 班组 → 在岗/不在岗 + 本周排班 */
  function openDeptModal(focusName) {
    var p = DATA.personnel;
    if (!p) return;
    var title = Editable.get('modal_dept_title', '部门在岗详情');
    var html = '<div class="modal-box" id="deptModalBox">';
    html += '<div class="dept-tabs" id="deptTabs">';
    p.departments.forEach(function (d, i) {
      var act = (focusName ? d.name === focusName : i === 0) ? ' active' : '';
      html += '<span class="' + act.trim() + '" data-id="' + d.id + '">' + d.name + '（' + d.online + '）</span>';
    });
    html += '</div><div id="deptDetail"></div></div>';

    layer.open({
      type: 1,
      title: title,
      skin: 'dept-skin',
      area: ['860px', '80%'],
      shadeClose: true,
      content: html,
      success: function (layero) {
        var $box = $(layero);
        function show(id) {
          var d = p.departments.filter(function (x) { return x.id === id; })[0] || p.departments[0];
          $box.find('#deptTabs span').removeClass('active');
          $box.find('#deptTabs span[data-id="' + d.id + '"]').addClass('active');
          var h = '';
          h += '<div class="leader-card"><div class="avatar">👤</div><div class="info">';
          h += '<b>' + d.leader.name + '</b>';
          h += '<div>' + d.leader.role + ' · ' + d.leader.phone + ' · 在线 ' + d.online + ' 人</div>';
          h += '</div></div>';
          (d.teams || []).forEach(function (t) {
            h += '<div class="team-block"><div class="team-name">班组：' + t.name + '</div>';
            h += '<h4>在岗</h4>';
            (t.onDuty || []).forEach(function (s) {
              h += '<div class="staff-row"><span class="nm">' + s.name + '</span><span class="rl">' + s.role +
                '</span><span class="sh">' + s.shift + '</span><span class="st on">' + s.status + '</span></div>';
            });
            if (!(t.onDuty && t.onDuty.length)) h += '<div class="staff-row"><span class="sh">暂无</span></div>';
            h += '<h4>不在岗</h4>';
            (t.offDuty || []).forEach(function (s) {
              h += '<div class="staff-row"><span class="nm">' + s.name + '</span><span class="rl">' + s.role +
                '</span><span class="sh">' + s.shift + '</span><span class="st off">' + s.status + '</span></div>';
            });
            if (!(t.offDuty && t.offDuty.length)) h += '<div class="staff-row"><span class="sh">暂无</span></div>';
            h += '<h4>本周排班</h4>';
            h += '<table class="tbl"><thead><tr><th>星期</th><th>排班</th></tr></thead><tbody>';
            (t.weekSchedule || []).forEach(function (w) {
              h += '<tr><td>' + w.day + '</td><td style="text-align:left;padding-left:10px">' + w.shifts + '</td></tr>';
            });
            h += '</tbody></table></div>';
          });
          $box.find('#deptDetail').html(h);
        }
        var first = focusName
          ? (p.departments.filter(function (x) { return x.name === focusName; })[0] || p.departments[0])
          : p.departments[0];
        show(first.id);
        $box.find('#deptTabs').on('click', 'span', function (ev) {
          ev.stopPropagation();
          show($(this).data('id'));
        });
      }
    });
  }

  /* ---------- 左2：设施设备 ---------- */
  function renderLeft2(f) {
    if (!f) return;
    var box = document.getElementById('facHomeGrid');
    if (!box) return;
    var html = '';
    f.items.forEach(function (it) {
      var cls = it.status === '预警' ? 'warn' : (it.status === '故障' ? 'bad' : '');
      var scls = it.status === '正常' ? 'ok' : 'warn';
      html += '<div class="fac-card"><div class="n ' + cls + '">' + it.online + '<small style="font-size:11px;color:#8fb0c7">/' + it.total + '</small></div>';
      html += '<div class="l">' + it.name + '</div><div class="s ' + scls + '">' + it.status + '</div></div>';
    });
    box.innerHTML = html;
  }

  function openFacilityModal() {
    var f = DATA.facility;
    if (!f) return;
    var html = '<div class="modal-box"><table class="tbl"><thead><tr>';
    html += '<th>设备类型</th><th>总量</th><th>在线</th><th>故障</th><th>离线</th><th>状态</th></tr></thead><tbody>';
    f.items.forEach(function (it) {
      html += '<tr><td>' + it.name + '</td><td>' + it.total + '</td><td>' + it.online +
        '</td><td>' + it.fault + '</td><td>' + it.offline + '</td><td class="' +
        (it.status === '正常' ? 'lvl-一般' : 'lvl-预警') + '">' + it.status + '</td></tr>';
    });
    html += '</tbody></table><p style="margin-top:10px;font-size:12px;color:#8fb0c7">原型说明：首页数字清晰即可；弹窗做减法，便于领导快速扫读。</p></div>';
    layer.open({
      type: 1, title: Editable.get('modal_facility_title', '设施设备详情'),
      skin: 'dept-skin', area: ['720px', '70%'], shadeClose: true, content: html
    });
  }

  /* ---------- 左3：行为上墙 ---------- */
  function renderLeft3(b) {
    if (!b) return;
    var tb = document.querySelector('#behaviorTable tbody');
    if (!tb) return;
    var rows = b.rows.slice(0, 6);
    var html = '';
    rows.forEach(function (r) {
      html += '<tr data-id="' + r.id + '"><td>' + r.time.slice(11) + '</td><td class="lvl-' + r.level + '">' +
        r.level + '</td><td>' + r.type + '</td><td>' + r.location + '</td><td>' + r.status + '</td></tr>';
    });
    tb.innerHTML = html;
  }

  function openBehaviorModal(focusId) {
    var b = DATA.behavior;
    if (!b) return;
    var html = '<div class="modal-box">';
    html += '<div class="search-bar"><input id="behQ" placeholder="搜索类型/地点/描述/处理人…" /><button class="layui-btn layui-btn-sm" id="behSearchBtn">查询</button></div>';
    html += '<div class="table-scroll" style="max-height:42vh"><table class="tbl" id="behFullTable"><thead><tr>';
    html += '<th>编号</th><th>时间</th><th>等级</th><th>类型</th><th>地点</th><th>状态</th></tr></thead><tbody></tbody></table></div>';
    html += '<div id="behDetail" style="margin-top:10px"></div></div>';

    layer.open({
      type: 1, title: Editable.get('modal_behavior_title', '行为上墙查询'),
      skin: 'dept-skin', area: ['900px', '82%'], shadeClose: true, content: html,
      success: function () {
        function paint(list) {
          var tb = document.querySelector('#behFullTable tbody');
          var h = '';
          list.forEach(function (r) {
            h += '<tr data-id="' + r.id + '"><td>' + r.id + '</td><td>' + r.time + '</td><td class="lvl-' + r.level + '">' +
              r.level + '</td><td>' + r.type + '</td><td>' + r.location + '</td><td>' + r.status + '</td></tr>';
          });
          tb.innerHTML = h || '<tr><td colspan="6">无匹配记录</td></tr>';
        }
        function showDetail(id) {
          var r = b.rows.filter(function (x) { return x.id === id; })[0];
          if (!r) return;
          $('#behDetail').html(
            '<h4>详情 · ' + r.id + '</h4>' +
            '<div class="team-block">' +
            '<div class="staff-row"><span class="rl">等级</span><span class="nm lvl-' + r.level + '">' + r.level + '</span>' +
            '<span class="rl">类型</span><span class="sh">' + r.type + '</span></div>' +
            '<div class="staff-row"><span class="rl">地点</span><span class="sh">' + r.location + '</span>' +
            '<span class="rl">时间</span><span class="sh">' + r.time + '</span></div>' +
            '<div class="staff-row"><span class="rl">描述</span><span class="sh">' + r.desc + '</span></div>' +
            '<div class="staff-row"><span class="rl">处理人</span><span class="sh">' + r.handler + '</span>' +
            '<span class="rl">状态</span><span class="sh">' + r.status + '</span></div></div>'
          );
        }
        function doSearch() {
          var q = ($('#behQ').val() || '').trim();
          var list = b.rows;
          if (q) {
            list = b.rows.filter(function (r) {
              return (r.type + r.location + r.desc + r.handler + r.level + r.id).indexOf(q) >= 0;
            });
          }
          paint(list);
        }
        paint(b.rows);
        if (focusId) showDetail(focusId);
        $('#behSearchBtn').on('click', doSearch);
        $('#behQ').on('keydown', function (e) { if (e.key === 'Enter') doSearch(); });
        $('#behFullTable').on('click', 'tr[data-id]', function () {
          showDetail($(this).data('id'));
        });
      }
    });
  }

  /* ---------- 中1/中2：航班摘要 ---------- */
  function renderMidFlight(fl) {
    if (!fl || !fl.homeSummary) return;
    var s = fl.homeSummary;
    var setText = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
    setText('fTotal', s.totalToday);
    setText('fOntime', s.ontimeRate);
    setText('fDelay', s.delayed);
    setText('fAvgDelay', s.avgDelayMin);
    var tb = document.querySelector('#flightNextTable tbody');
    if (tb) {
      var h = '';
      (s.nextFlights || []).forEach(function (f) {
        h += '<tr><td class="flight-code">' + f.code + '</td><td>' + f.dir + '</td><td>' + f.time + '</td><td>' + f.status + '</td></tr>';
      });
      tb.innerHTML = h;
    }
  }

  /* ---------- 中3：安检排队占位 ---------- */
  function renderMid3(q) {
    if (!q) return;
    var box = document.getElementById('queueBox');
    if (!box) return;
    var max = Math.max.apply(null, q.channels.map(function (c) { return c.queue; })) || 1;
    var h = '';
    q.channels.forEach(function (c) {
      var pct = Math.round(c.queue / max * 100);
      var busy = c.status === '繁忙' ? ' busy' : '';
      h += '<div class="queue-item"><span class="qn">' + c.name + '</span>';
      h += '<span class="bar' + busy + '"><i style="width:' + pct + '%"></i></span>';
      h += '<span class="qv">' + c.queue + '人 / ' + c.waitMin + '分</span></div>';
    });
    h += '<div class="queue-note">' + (q.note || '') + ' · 合计排队 ' + q.totalQueue + ' 人，平均等待 ' + q.avgWait + ' 分钟</div>';
    box.innerHTML = h;
  }

  /* ---------- 右1：气象 ---------- */
  function renderRight1(w) {
    if (!w) return;
    var icon = document.getElementById('wIcon');
    var temp = document.getElementById('wTemp');
    var desc = document.getElementById('wDesc');
    if (icon) icon.textContent = w.icon || '☀️';
    if (temp) temp.textContent = w.temp + '℃';
    if (desc) desc.textContent = w.desc;
    var ws = w.windSpeed;
    var wcls = windClass(ws);
    var grid = document.getElementById('wGrid');
    if (grid) {
      grid.innerHTML =
        '<div class="weather-item"><div class="w-val">' + w.humidity + '%</div><div class="w-label">湿度</div></div>' +
        '<div class="weather-item"><div class="w-val ' + wcls + '">' + w.windDir + ' ' + ws + 'm/s</div><div class="w-label">风速风向</div></div>' +
        '<div class="weather-item"><div class="w-val">' + w.visibility + 'km</div><div class="w-label">能见度</div></div>' +
        '<div class="weather-item"><div class="w-val">' + w.pressure + 'hPa</div><div class="w-label">气压</div></div>' +
        '<div class="weather-item"><div class="w-val">' + w.precip + 'mm</div><div class="w-label">降水</div></div>' +
        '<div class="weather-item"><div class="w-val">' + w.runway + '</div><div class="w-label">跑道状态</div></div>';
    }
    // 顶部摘要
    var top = document.getElementById('topWeather');
    if (top) top.innerHTML = '<strong>' + w.desc + ' ' + w.temp + '℃</strong>';

    // 风速趋势小图（用趋势里的 wind，按规则着色提示）
    if (w.trend) {
      var windColors = w.trend.wind.map(function (v) {
        if (v > 15) return '#ff4d4f';
        if (v >= 12) return '#ffaa00';
        return '#00e7ff';
      });
      regChart('chartWindMini', {
        grid: { left: 28, right: 8, top: 24, bottom: 20 },
        tooltip: { trigger: 'axis' },
        legend: { data: ['风速', '气温'], textStyle: { color: '#8fb0c7', fontSize: 10 }, top: 0 },
        xAxis: { type: 'category', data: w.trend.times, axisLabel: { color: '#8fb0c7', fontSize: 9 }, axisLine: { lineStyle: { color: 'rgba(0,231,255,.3)' } } },
        yAxis: { type: 'value', axisLabel: { color: '#8fb0c7', fontSize: 9 }, splitLine: { lineStyle: { color: 'rgba(0,231,255,.1)' } } },
        series: [
          {
            name: '风速', type: 'bar', data: w.trend.wind.map(function (v, i) {
              return { value: v, itemStyle: { color: windColors[i] } };
            }), barWidth: '40%'
          },
          { name: '气温', type: 'line', data: w.trend.temp, smooth: true, itemStyle: { color: '#00f2a9' }, lineStyle: { width: 2 } }
        ]
      });
    }
  }

  /* ---------- 右2：STOP ---------- */
  function renderRight2(s) {
    if (!s) return;
    var setText = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
    setText('stopPeople', s.onlinePeople);
    setText('stopDevices', s.onlineDevices);
    setText('stopCover', s.coverage);
    setText('stopAlarms', s.alarms);
  }

  function openStopModal() {
    var s = DATA.stop;
    if (!s) return;
    var html = '<div class="modal-box">';
    html += '<p style="font-size:12px;color:#8fb0c7;margin-bottom:8px">' + (s.mockNote || '') + '</p>';
    html += '<div class="stop-stats" style="margin-bottom:12px">';
    html += '<div class="kpi"><b>' + s.onlinePeople + '</b><span>在线人数</span></div>';
    html += '<div class="kpi"><b>' + s.onlineDevices + '</b><span>在线设备</span></div></div>';
    html += '<table class="tbl"><thead><tr><th>设备</th><th>在线</th><th>总量</th></tr></thead><tbody>';
    (s.devices || []).forEach(function (d) {
      html += '<tr><td>' + d.name + '</td><td>' + d.online + '</td><td>' + d.total + '</td></tr>';
    });
    html += '</tbody></table>';
    html += '<p style="margin-top:12px"><a class="stop-link" href="' + s.url + '" target="_blank" rel="noopener">尝试打开远端 STOP：' + s.url + '</a></p>';
    // iframe 兜底：远端常不可达，用 onerror/超时提示
    html += '<div style="margin-top:10px;height:280px;border:1px solid rgba(0,231,255,.25);border-radius:8px;overflow:hidden;position:relative;background:#041228">';
    html += '<iframe id="stopFrame" src="' + s.url + '" style="width:100%;height:100%;border:0;opacity:.85"></iframe>';
    html += '<div id="stopFallback" style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;flex-direction:column;color:#8fb0c7;font-size:13px;padding:20px;text-align:center;background:rgba(4,18,40,.92)">';
    html += '<div style="font-size:28px;margin-bottom:8px">📡</div>远端 STOP 不可达，已显示 mock 数据。<br>可点击上方链接在新窗口尝试打开。</div></div>';
    html += '</div>';

    layer.open({
      type: 1, title: Editable.get('modal_stop_title', 'STOP 系统'),
      skin: 'dept-skin', area: ['820px', '85%'], shadeClose: true, content: html,
      success: function () {
        // 3 秒后若 iframe 仍跨域无法探测，展示兜底提示（演示友好）
        setTimeout(function () {
          var fb = document.getElementById('stopFallback');
          if (fb) { fb.style.display = 'flex'; }
        }, 2800);
      }
    });
  }

  /* ---------- 右3：AI 态势预警 ---------- */
  function renderRight3(a) {
    if (!a) return;
    var tag = document.getElementById('aiTag');
    if (tag) tag.textContent = (a.summary.urgent + a.summary.warn) + '条待关注';
    regChart('chartAi', {
      tooltip: { trigger: 'axis' },
      legend: { data: ['今日', '昨日'], textStyle: { color: '#8fb0c7', fontSize: 10 }, top: 0 },
      grid: { left: 30, right: 10, top: 28, bottom: 22 },
      xAxis: { type: 'category', data: a.chart.categories, axisLabel: { color: '#8fb0c7', fontSize: 10 }, axisLine: { lineStyle: { color: 'rgba(0,231,255,.3)' } } },
      yAxis: { type: 'value', axisLabel: { color: '#8fb0c7', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(0,231,255,.1)' } } },
      series: [
        { name: '今日', type: 'bar', data: a.chart.today, itemStyle: { color: '#ffaa00', borderRadius: [3, 3, 0, 0] }, barWidth: '30%' },
        { name: '昨日', type: 'bar', data: a.chart.yesterday, itemStyle: { color: '#1890ff', borderRadius: [3, 3, 0, 0] }, barWidth: '30%' }
      ]
    });
    var ul = document.getElementById('aiAlarms');
    if (ul) {
      var h = '';
      a.list.slice(0, 4).forEach(function (x) {
        h += '<li class="level-' + x.level + '"><span>' + x.text + '</span><span class="alarm-time">' + x.time + '</span></li>';
      });
      ul.innerHTML = h;
    }
  }

  function openAiModal() {
    var a = DATA.ai;
    if (!a) return;
    var html = '<div class="modal-box">';
    html += '<div class="kpi-grid4" style="margin-bottom:12px">';
    html += '<div class="kpi"><b style="color:#ff4d4f">' + a.summary.urgent + '</b><span>紧急</span></div>';
    html += '<div class="kpi"><b style="color:#ffaa00">' + a.summary.warn + '</b><span>预警</span></div>';
    html += '<div class="kpi"><b style="color:#1890ff">' + a.summary.info + '</b><span>提示</span></div>';
    html += '<div class="kpi"><b>' + a.list.length + '</b><span>合计</span></div></div>';
    html += '<div id="aiModalChart" style="height:220px;margin-bottom:10px"></div>';
    html += '<ul class="alarm-list" style="max-height:28vh">';
    a.list.forEach(function (x) {
      html += '<li class="level-' + x.level + '"><span>[' + x.type + '] ' + x.text + '</span><span class="alarm-time">' + x.time + '</span></li>';
    });
    html += '</ul></div>';
    layer.open({
      type: 1, title: Editable.get('modal_ai_title', 'AI 态势预警展开'),
      skin: 'dept-skin', area: ['780px', '82%'], shadeClose: true, content: html,
      success: function () {
        var c = echarts.init(document.getElementById('aiModalChart'));
        c.setOption({
          tooltip: { trigger: 'item' },
          series: [{
            type: 'pie', radius: ['40%', '68%'],
            label: { color: '#e6f7ff' },
            data: [
              { name: '紧急', value: a.summary.urgent, itemStyle: { color: '#ff4d4f' } },
              { name: '预警', value: a.summary.warn, itemStyle: { color: '#ffaa00' } },
              { name: '提示', value: a.summary.info, itemStyle: { color: '#1890ff' } }
            ]
          }]
        });
      }
    });
  }

  /* ---------- 绑定面板点击 ---------- */
  function bindClicks() {
    $('#panelLeft1').on('click', function (e) {
      // 避免点编辑文案时误开弹窗；柱体点击已在图表里单独打开
      if ($(e.target).closest('.ed').length) return;
      if (charts.chartDept && charts.chartDept.__deptBarClick) {
        charts.chartDept.__deptBarClick = false;
        return;
      }
      openDeptModal();
    });
    $('#panelLeft2').on('click', function (e) {
      if ($(e.target).closest('.ed').length) return;
      openFacilityModal();
    });
    $('#panelLeft3').on('click', function (e) {
      if ($(e.target).closest('.ed').length) return;
      var id = $(e.target).closest('tr[data-id]').data('id');
      openBehaviorModal(id);
    });
    $('#panelMid1,#panelMid2').on('click', function (e) {
      if ($(e.target).closest('.ed').length) return;
      // 跳转航班详情页（表格+甘特同一 JSON）
      location.href = 'flight.html';
    });
    $('#panelRight2').on('click', function (e) {
      if ($(e.target).closest('.ed').length) return;
      openStopModal();
    });
    $('#panelRight3').on('click', function (e) {
      if ($(e.target).closest('.ed').length) return;
      openAiModal();
    });
    $('#btnExport').on('click', function () { Editable.exportJSON(); });
    $('#btnImport').on('click', function () { Editable.triggerImport(); });
    $('#btnStopNav').on('click', function (e) {
      e.preventDefault();
      openStopModal();
    });
  }

  /* ---------- 启动 ---------- */
  function boot() {
    layui.use(['layer', 'element'], function () {
      layer = layui.layer;
      $ = layui.$;
      // 也挂到全局，弹窗内方便用
      window.$ = $;

      Editable.init({ url: 'data/content.json' }).then(function () {
        return Promise.all([
          fetchJSON('data/personnel.json'),
          fetchJSON('data/facility.json'),
          fetchJSON('data/behavior.json'),
          fetchJSON('data/flights.json'),
          fetchJSON('data/security-queue.json'),
          fetchJSON('data/weather.json'),
          fetchJSON('data/stop.json'),
          fetchJSON('data/ai-alerts.json')
        ]);
      }).then(function (arr) {
        DATA.personnel = arr[0];
        DATA.facility = arr[1];
        DATA.behavior = arr[2];
        DATA.flights = arr[3];
        DATA.queue = arr[4];
        DATA.weather = arr[5];
        DATA.stop = arr[6];
        DATA.ai = arr[7];

        renderLeft1(DATA.personnel);
        renderLeft2(DATA.facility);
        renderLeft3(DATA.behavior);
        renderMidFlight(DATA.flights);
        renderMid3(DATA.queue);
        renderRight1(DATA.weather);
        renderRight2(DATA.stop);
        renderRight3(DATA.ai);

        bindClicks();
        updateClock();
        setInterval(updateClock, 1000);
        window.addEventListener('resize', resizeCharts);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
