// ==UserScript==
// @name         工时日志一键导出
// @namespace    http://tampermonkey.net/
// @version      1.1
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

    // 执行纯前端数据抓取并导出
    async function exportData() {
        if (!confirm('提示：\n由于接口访问受限，脚本将采用【模拟页面自动翻页】的方式提取数据。\n\n请确保您已经使用页面自带的 [检索] 按钮，查询出了需要导出的数据列表！\n\n点击【确定】开始自动翻页抓取。')) {
            return;
        }

        const btnInfo = document.querySelector('#export-log-btn');
        btnInfo.innerText = '正在自动翻页抓取...';
        btnInfo.disabled = true;

        try {
            let allData = [];
            let isLastPage = false;

            // 等待函数
            const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

            // 计算截止日期：起始日期往前推 60 天，超过这个日期的数据就不再拉取
            const cutoffDate = new Date(startDateStr);
            cutoffDate.setDate(cutoffDate.getDate() - 60);
            const cutoffDateStr = formatDate(cutoffDate);

            // 先尝试回到第一页
            const firstPageBtn = document.querySelector('.el-pagination .el-pager li.number');
            if (firstPageBtn && !firstPageBtn.classList.contains('is-active') && !firstPageBtn.classList.contains('active')) {
                firstPageBtn.click();
                await wait(1500); // 等待第一页加载
            }

            let pageCount = 1;
            // 循环翻页抓取
            while (!isLastPage) {
                btnInfo.innerText = `抓取第 ${pageCount} 页...`;

                // 获取表头
                const headerCells = document.querySelectorAll('thead th, .el-table__header th');
                const headers = Array.from(headerCells).map(th => th.innerText.trim().replace(/[\r\n]+/g, ' '));

                if (headers.length > 0) {
                    // 获取当前页的行
                    const rows = document.querySelectorAll('tbody tr, .el-table__body tr');
                    rows.forEach(tr => {
                        const cells = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim());
                        if (cells.length > 0) {
                            let rowObj = {};
                            headers.forEach((h, i) => {
                                if (h) rowObj[h] = cells[i];
                            });

                            // 利用自定义的日期框做本地二次过滤
                            let dateStr = rowObj['工作时间'] || rowObj['日期'] || '';
                            dateStr = dateStr.slice(0, 10);

                            if (!dateStr || (dateStr >= startDateStr && dateStr <= endDateStr)) {
                                allData.push(rowObj);
                            }

                            // 超出截止日期（比起始日期早 60 天以上），停止继续翻页
                            if (dateStr && dateStr < cutoffDateStr) {
                                console.log(`[工时导出] 数据日期 ${dateStr} 已超出截止日期 ${cutoffDateStr}，停止翻页。`);
                                isLastPage = true;
                            }
                        }
                    });
                }

                // 如果已被早停标记则不再翻页
                if (isLastPage) break;

                // 检查是否有下一页按钮且可用
                const nextBtn = document.querySelector('.btn-next');
                if (nextBtn && !nextBtn.disabled && !nextBtn.classList.contains('is-disabled') && nextBtn.getAttribute('aria-disabled') !== 'true') {
                    nextBtn.click();
                    pageCount++;
                    await wait(800); // 必须等待页面渲染下一页并从缓存读取
                } else {
                    isLastPage = true;
                }
            }

            if (allData.length > 0) {
                // 去重（防止动态翻页时抓到重复 DOM）
                const uniqueData = Array.from(new Set(allData.map(JSON.stringify))).map(JSON.parse);
                
                // 将对象转为 CSV
                let csvStr = '\uFEFF'; // BOM 头
                let finalHeaders = Object.keys(uniqueData[0]).filter(h => h && h !== '操作'); // 过滤掉“操作”列之类
                csvStr += finalHeaders.join(',') + '\r\n';
                
                uniqueData.forEach(row => {
                    let line = finalHeaders.map(h => {
                        let val = (row[h] || '').toString().replace(/"/g, '""').replace(/[\r\n]+/g, ' ');
                        return `"${val}"`;
                    }).join(',');
                    csvStr += line + '\r\n';
                });
                
                downloadCSV(csvStr, `工作日志_${startDateStr}_至_${endDateStr}_本地抓取.csv`);
                alert(`✅ 抓取完成！\n共翻看 ${pageCount} 页，成功为您提取并导出符合日期范围的 ${uniqueData.length} 条记录！`);
            } else {
                alert(`⚠️ 在当前列表中没有找到限定日期区间 (${startDateStr} 至 ${endDateStr}) 的数据！\n请注意：脚本只能抓取页面上已有的数据，请先检索。`);
            }

        } catch (error) {
            console.error('[工时导出] 抓取失败:', error);
            alert(`❌ 抓取失败\n\n错误信息: ${error.message}\n如果页面元素发生变动会导致此报错。`);
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

    // 检查当前页面是否处于 dispatch tab
    function isDispatchTab() {
        return new URLSearchParams(window.location.search).get('activeTab') === 'dispatch';
    }

    // 移除已注入的 UI
    function removeUI() {
        const btn = document.querySelector('#export-log-btn');
        if (btn) {
            // 找到外层容器（按钮的父节点）并移除
            const wrapper = btn.closest('div[style]');
            if (wrapper) wrapper.remove();
            else btn.remove();
        }
    }

    // 监控页面变化，因为是 Vue 单页应用，DOM 可能是动态加载的
    const observer = new MutationObserver((mutations, obs) => {
        if (isDispatchTab()) {
            const formEl = document.querySelector('.el-form');
            if (formEl && !document.querySelector('#export-log-btn')) {
                injectUI();
            }
        } else {
            // 不在 dispatch tab 时，移除已注入的按钮
            removeUI();
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // 初始尝试注入（仅在 dispatch tab 时）
    setTimeout(() => {
        if (isDispatchTab()) injectUI();
    }, 2000);

})();
