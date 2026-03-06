// ==UserScript==
// @name         工时日志一键导出
// @namespace    http://tampermonkey.net/
// @version      2.3
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

    // 默认页码范围
    let startPage = 1;
    let endPage = 10;

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
        startPage = parseInt(document.querySelector('#export-start-page').value, 10);
        endPage = parseInt(document.querySelector('#export-end-page').value, 10);

        if (isNaN(startPage) || isNaN(endPage) || startPage < 1 || startPage > endPage) {
            alert('请填写正确的页码范围！\n起始页必须 >= 1，且不能大于结束页。');
            return;
        }

        if (!confirm(`准备导出：从 第 ${startPage} 页 到 第 ${endPage} 页\n\n脚本将自动翻看这些页并抓取所有可见数据。\n点击【确定】开始。`)) {
            return;
        }

        const btnInfo = document.querySelector('#export-log-btn');
        btnInfo.innerText = '正在准备...';
        btnInfo.disabled = true;

        try {
            let allData = [];
            
            // 等待函数
            const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

            // 安全到达目标页的辅助函数
            async function goToPage(target) {
                let attempts = 0;
                while (attempts < 50) { // 最多试 50 次防止死循环
                    let activeLi = document.querySelector('.el-pagination .el-pager li.active') || document.querySelector('.el-pagination .el-pager li.is-active');
                    let curr = activeLi ? parseInt(activeLi.innerText, 10) : 1;
                    
                    if (curr === target) return true;
                    
                    // 1. 如果目标页签直接在可视范围内，直接点击
                    let allLis = document.querySelectorAll('.el-pagination .el-pager li.number');
                    let targetLi = Array.from(allLis).find(li => parseInt(li.innerText, 10) === target);
                    if (targetLi) {
                        targetLi.click();
                        await wait(1000);
                        continue;
                    }
                    
                    // 2. 如果没能直接点击到，就通过下一页/上一页按钮逼近
                    if (curr < target) {
                        let nextBtn = document.querySelector('.btn-next');
                        if (!nextBtn || nextBtn.disabled || nextBtn.classList.contains('is-disabled')) return false;
                        nextBtn.click();
                    } else {
                        let prevBtn = document.querySelector('.btn-prev');
                        if (!prevBtn || prevBtn.disabled || prevBtn.classList.contains('is-disabled')) return false;
                        prevBtn.click();
                    }
                    await wait(800);
                    attempts++;
                }
                return false;
            }

            // 执行实际跳页
            btnInfo.innerText = `准备跳到第 ${startPage} 页...`;
            let reached = await goToPage(startPage);
            if (!reached) {
                 alert(`跳转到第 ${startPage} 页失败！请检查页码是否超出最大范围。`);
                 btnInfo.innerText = '一键导出';
                 btnInfo.disabled = false;
                 return;
            }
            
            // ❗ 关键修复：到达目标起始页后，必须等待表格网络请求真正完成加载
            btnInfo.innerText = `正在加载第 ${startPage} 页数据...`;
            await wait(2000); 

            let currentPage = startPage;

            // 开始从起始页按序翻到结束页
            while (currentPage <= endPage) {
                btnInfo.innerText = `正在抓取第 ${currentPage} 页...`;

                // ⚡ 只取主体区域的表头，避免固定列的重复导致列名对应错乱
                const headerWrapper = document.querySelector(
                    '.el-table__header-wrapper thead, .el-table__body-wrapper thead'
                );
                const headers = headerWrapper
                    ? Array.from(headerWrapper.querySelectorAll('th')).map(th => th.innerText.trim().replace(/[\r\n]+/g, ' '))
                    : [];

                if (headers.length > 0) {
                    console.log(`[调试] 第${currentPage}页 表头:`, headers);

                    // ⚡ 只取主体 wrapper 里的 tr
                    const bodyWrapper = document.querySelector('.el-table__body-wrapper');
                    const rows = bodyWrapper ? bodyWrapper.querySelectorAll('tbody tr') : [];
                    console.log(`[调试] 第${currentPage}页 找到 ${rows.length} 行数据`);

                    rows.forEach((tr, idx) => {
                        const cells = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim());
                        if (cells.length > 0) {
                            let rowObj = {};
                            headers.forEach((h, i) => {
                                if (h) rowObj[h] = cells[i];
                            });
                            
                            // 因为此时是按照页数强制抓取，无视任何日期判定，所见即所得
                            allData.push(rowObj);
                            console.log(`[调试] 行${idx} 添加成功`);
                        }
                    });
                }

                // 判断是否已经抓完最后一页要求，或者是由于页面真没有了提前撞墙
                if (currentPage >= endPage) {
                     break;
                }

                // 继续点下一页按钮
                const nextBtn = document.querySelector('.btn-next');
                if (nextBtn && !nextBtn.disabled && !nextBtn.classList.contains('is-disabled') && nextBtn.getAttribute('aria-disabled') !== 'true') {
                    nextBtn.click();
                    currentPage++;
                    await wait(800);
                } else {
                    console.log('[调试] 已经没有下一页了，提前结束抓取。');
                    break;
                }
            }

            if (allData.length > 0) {
                // 去重（防止动态翻页时抓到重复 DOM）
                const uniqueData = Array.from(new Set(allData.map(JSON.stringify))).map(JSON.parse);
                
                // 提取最老和最新日期用于构建文件名，绝不改变导出原数据中的日期格式
                let earliestDate = "未知";
                let latestDate = "未知";
                
                const dates = uniqueData.map(row => {
                    let d = row['工作时间'] || row['日期'] || '';
                    // 取纯日期部分，并把斜线转为短横线（因为文件名里不能带 /）
                    return d.split(' ')[0].replace(/\//g, '-');
                }).filter(d => Boolean(d));

                if (dates.length > 0) {
                    // 按时间戳升序排序
                    dates.sort((a, b) => new Date(a.replace(/-/g, '/')).getTime() - new Date(b.replace(/-/g, '/')).getTime());
                    earliestDate = dates[0];
                    latestDate = dates[dates.length - 1];
                }
                
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
                
                // 构建文件名：最老日期_至_最新日期
                let fileName = `工作日志_${earliestDate}_至_${latestDate}_本地抓取.csv`;
                if (earliestDate === latestDate) {
                    fileName = `工作日志_${earliestDate}_本地抓取.csv`;
                }
                
                downloadCSV(csvStr, fileName);
                alert(`✅ 抓取完成！\n成功提取并导出 ${uniqueData.length} 条记录！`);
            } else {
                alert(`⚠️ 在第 ${startPage} 到 ${endPage} 页中没有抓取到任何数据！`);
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
                <span style="font-size:14px; color:#606266;">导出页码:</span>
                <input type="number" id="export-start-page" value="${startPage}" min="1" style="border:1px solid #dcdfe6; border-radius:4px; padding:3px 8px; height:28px; outline:none; width: 60px;">
                <span style="font-size:14px; color:#606266;">至</span>
                <input type="number" id="export-end-page" value="${endPage}" min="1" style="border:1px solid #dcdfe6; border-radius:4px; padding:3px 8px; height:28px; outline:none; width: 60px;">
                <span style="font-size:14px; color:#606266;">页</span>
                <button type="button" id="export-log-btn" style="display:inline-block; line-height:1; white-space:nowrap; cursor:pointer; background:#67c23a; border:none; color:#fff; text-align:center; box-sizing:border-box; outline:none; margin:0; transition:.1s; font-weight:500; padding:7px 15px; font-size:12px; border-radius:4px; margin-left: 5px;">一键导出</button>
            `;

            // 将其附加到容器中
            container.appendChild(customDiv);

            // 绑定事件
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
