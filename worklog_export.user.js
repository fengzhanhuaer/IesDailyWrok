// ==UserScript==
// @name         工时日志一键导出
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  在工时日志页面添加一键导出按选择日期范围出CSV文件的功能
// @author       Assistant
// @match        *://172.20.10.80/hr/work/workLogmy*
// @grant        GM_download
// @updateURL    https://raw.githubusercontent.com/fengzhanhuaer/IesDailyWrok/main/worklog_export.user.js
// @downloadURL  https://raw.githubusercontent.com/fengzhanhuaer/IesDailyWrok/main/worklog_export.user.js
// ==/UserScript==

(function() {
    'use strict';

    // 格式化日期为 YYYY-MM-DD
    function formatDate(date) {
        const d = new Date(date);
        let month = '' + (d.getMonth() + 1);
        let day = '' + d.getDate();
        const year = d.getFullYear();

        if (month.length < 2) month = '0' + month;
        if (day.length < 2) day = '0' + day;

        return [year, month, day].join('-');
    }

    // 获取当前月的第一天和最后一天
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    let startDateStr = formatDate(firstDay);
    let endDateStr = formatDate(lastDay);

    // 将 JSON 数据转为 CSV 格式
    function convertToCSV(objArray) {
        const array = typeof objArray !== 'object' ? JSON.parse(objArray) : objArray;
        // 表头
        const headers = ['姓名', '工号', '工作时间', '工作大类', '项目类型', '工作子类', '对应产品线', '产品号', '工作描述', '工时(h)', '审核人'];
        const keys = ['lastname', 'workcode', 'workTime', 'workCategoryName', 'xmlxName', 'gzzlName', 'dycpxName', 'productNumber', 'workDescription', 'hoursWorked', 'reviewerName'];

        let str = '\uFEFF'; // BOM 确保 Excel 正常识别中文字符
        str += headers.join(',') + '\r\n';

        for (let i = 0; i < array.length; i++) {
            let line = '';
            for (let index in keys) {
                if (line !== '') line += ',';
                // 替换内容中的逗号、换行符等，防止破坏 CSV 结构
                let value = array[i][keys[index]] || '';
                value = value.toString().replace(/"/g, '""'); // 转义双引号
                value = value.toString().replace(/[\r\n]+/g, ' '); // 替换换行符为空格
                line += `"${value}"`;
            }
            str += line + '\r\n';
        }
        return str;
    }

    // 导出文件函数
    function downloadCSV(csv, filename) {
        let blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        let link = document.createElement("a");
        if (link.download !== undefined) {
            let url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    // 从 Cookie 中读取指定 key 的值
    function getCookieValue(name) {
        const match = document.cookie.match(new RegExp('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)'));
        return match ? decodeURIComponent(match[2]) : null;
    }

    // 执行数据获取并导出
    async function exportData() {
        // 优先从 localStorage 取，再尝试 Cookie，再尝试 sessionStorage
        const token = localStorage.getItem('Admin-Token')
                   || getCookieValue('Admin-Token')
                   || sessionStorage.getItem('Admin-Token');

        const btnInfo = document.querySelector('#export-log-btn');
        btnInfo.innerText = '正在导出...';
        btnInfo.disabled = true;

        try {
            // shzt=2 代表审批完成
            const apiUrl = `/api/hr/workLog/list?shzt=2&pageNum=1&pageSize=3000&beginTime=${startDateStr}&endTime=${endDateStr}`;
            console.log('[工时导出] 请求 URL:', apiUrl);
            console.log('[工时导出] Token:', token ? token.substring(0, 20) + '...' : '未找到');

            // 构建请求头：携带 Cookie 会话（credentials: include）同时附带 Token
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const response = await fetch(apiUrl, {
                method: 'GET',
                headers,
                credentials: 'include'  // 关键：携带浏览器 Cookie（会话凭证）
            });

            if (!response.ok) {
                throw new Error(`服务器返回错误状态: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            console.log('[工时导出] 响应:', JSON.stringify(data).substring(0, 300));

            if (data && data.rows && data.rows.length > 0) {
                const csvData = convertToCSV(data.rows);
                downloadCSV(csvData, `工作日志_${startDateStr}_至_${endDateStr}.csv`);
                alert(`✅ 成功导出 ${data.rows.length} 条记录！\n（服务器共返回 ${data.total} 条）`);
            } else {
                // 显示详细信息帮助排查
                const debugInfo = [
                    `日期区间: ${startDateStr} 至 ${endDateStr}`,
                    `请求URL: ${apiUrl}`,
                    `响应code: ${data?.code}`,
                    `响应msg: ${data?.msg}`,
                    `返回total: ${data?.total}`,
                    `Token状态: ${token ? '已找到' : '未找到（可能是认证问题）'}`,
                ].join('\n');
                alert(`⚠️ 该日期区间内没有数据\n\n【调试信息】\n${debugInfo}`);
            }
        } catch (error) {
            console.error('[工时导出] 失败:', error);
            alert(`❌ 导出失败\n\n错误信息: ${error.message}\n\n请打开浏览器控制台 (F12) 查看详细日志。`);
        } finally {
            btnInfo.innerText = '一键导出';
            btnInfo.disabled = false;
        }
    }

    // 在页面中注入 UI 元素
    function injectUI() {
        // 防止重复注入
        if (document.querySelector('#export-log-btn')) return;

        // 寻找合适的容器，通常是页面顶部的操作栏或者表单所在的行
        const container = document.querySelector('.el-form.el-form--inline') || document.querySelector('.el-form');
        
        if (container) {
            // 创建自定义的输入组容器
            const customDiv = document.createElement('div');
            customDiv.style.cssText = 'display: inline-flex; align-items: center; margin-left: 20px; gap: 10px; padding: 5px; background: #f5f7fa; border-radius: 4px; border: 1px solid #dcdfe6;';
            
            customDiv.innerHTML = `
                <span style="font-size:14px; color:#606266;">导出区间:</span>
                <input type="date" id="export-start-date" value="${startDateStr}" style="border:1px solid #dcdfe6; border-radius:4px; padding:3px 8px; height:28px; outline:none;">
                <span style="font-size:14px; color:#606266;">至</span>
                <input type="date" id="export-end-date" value="${endDateStr}" style="border:1px solid #dcdfe6; border-radius:4px; padding:3px 8px; height:28px; outline:none;">
                <button type="button" id="export-log-btn" style="display:inline-block; line-height:1; white-space:nowrap; cursor:pointer; background:#67c23a; border:none; color:#fff; text-align:center; box-sizing:border-box; outline:none; margin:0; transition:.1s; font-weight:500; padding:7px 15px; font-size:12px; border-radius:4px; margin-left: 5px;">一键导出</button>
            `;

            // 将其附加到容器中
            container.appendChild(customDiv);

            // 绑定事件
            document.querySelector('#export-start-date').addEventListener('change', (e) => {
                startDateStr = e.target.value;
            });
            document.querySelector('#export-end-date').addEventListener('change', (e) => {
                endDateStr = e.target.value;
            });
            document.querySelector('#export-log-btn').addEventListener('click', exportData);
        }
    }

    // 监控页面变化，因为是 Vue 单页应用，DOM 可能是动态加载的
    const observer = new MutationObserver((mutations, obs) => {
        const formEl = document.querySelector('.el-form');
        if (formEl && !document.querySelector('#export-log-btn')) {
            // 确保已经切换到了审批完成 tab
            injectUI();
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // 初始尝试注入
    setTimeout(injectUI, 2000);

})();
