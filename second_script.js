// ==UserScript==
// @name         GitHub Monthly Repo Graph
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Граф репозиториев GitHub за последний месяц
// @author       You
// @match        https://github.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @require      https://d3js.org/d3.v7.min.js
// ==/UserScript==

(function() {
    'use strict';

    class MonthlyRepoGraph {
        constructor() {
            this.username = this.getUsername();
            this.init();
        }

        getUsername() {
            return window.location.pathname.split('/')[1];
        }

        getDateRange() {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setMonth(endDate.getMonth() - 1);

            return {
                from: startDate.toISOString().split('T')[0],
                to: endDate.toISOString().split('T')[0]
            };
        }

        isProfilePage() {
            return !!document.querySelector('.js-profile-editable-area') &&
                   !this.isLinkRepoPage();
        }

        isLinkRepoPage() {
            return window.location.pathname.endsWith('/linkrepo');
        }

        addNavItem() {
            if (document.querySelector('#linkrepo-nav-item')) return;

            const navContainer = document.querySelector('.UnderlineNav-body') ||
                               document.querySelector('.UnderlineNav-list');
            if (!navContainer) return;

            const navItem = document.createElement('li');
            navItem.className = 'd-flex';

            const link = document.createElement('a');
            link.id = 'linkrepo-nav-item';
            link.href = `/${this.username}/linkrepo`;
            link.className = 'js-selected-navigation-item UnderlineNav-item hx_underlinenav-item no-underline js-responsive-underlinenav-item';

            const span = document.createElement('span');
            span.className = 'UnderlineNav-item-label truncate';
            span.textContent = 'Link repo (monthly)';

            link.appendChild(span);
            navItem.appendChild(link);

            const moreButton = document.querySelector('.UnderlineNav-item[data-tab-item="more"]');
            if (moreButton) {
                moreButton.parentNode.insertBefore(navItem, moreButton);
            } else {
                navContainer.appendChild(navItem);
            }
        }

        createPage() {
            document.body.textContent = '';

            const app = document.createElement('div');
            app.id = 'graph-app';
            app.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: #f6f8fa;
                z-index: 9999;
                overflow: hidden;
            `;

            const header = document.createElement('div');
            header.id = 'graph-header';
            header.style.cssText = `
                padding: 15px;
                background: #24292e;
                color: white;
                display: flex;
                justify-content: space-between;
                align-items: center;
            `;

            const title = document.createElement('h2');
            title.id = 'graph-title';
            title.style.margin = '0';
            title.style.fontSize = '18px';

            const dates = this.getDateRange();
            title.textContent = `Repository Links (${dates.from} to ${dates.to})`;

            const closeBtn = document.createElement('button');
            closeBtn.id = 'graph-close';
            closeBtn.style.cssText = `
                background: none;
                border: none;
                color: white;
                font-size: 16px;
                cursor: pointer;
            `;
            closeBtn.textContent = '✕ Close';

            const container = document.createElement('div');
            container.id = 'graph-container';
            container.style.cssText = `
                width: 100%;
                height: calc(100% - 50px);
            `;

            const loading = document.createElement('div');
            loading.className = 'loading';
            loading.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                font-size: 16px;
                text-align: center;
            `;

            const progress = document.createElement('div');
            progress.className = 'progress';
            progress.style.cssText = `
                width: 300px;
                height: 5px;
                background: #e1e4e8;
                border-radius: 3px;
                margin: 10px auto;
            `;

            const progressBar = document.createElement('div');
            progressBar.className = 'progress-bar';
            progressBar.style.cssText = `
                height: 100%;
                background: #28a745;
                border-radius: 3px;
                width: 0%;
                transition: width 0.3s;
            `;

            progress.appendChild(progressBar);
            loading.appendChild(document.createTextNode('Loading activity data...'));
            loading.appendChild(progress);
            container.appendChild(loading);

            header.appendChild(title);
            header.appendChild(closeBtn);
            app.appendChild(header);
            app.appendChild(container);
            document.body.appendChild(app);

            closeBtn.addEventListener('click', () => {
                window.location.href = `/${this.username}`;
            });
        }

        async loadActivityData() {
            const dates = this.getDateRange();
            const url = `https://github.com/${this.username}?tab=overview&from=${dates.from}&to=${dates.to}`;

            try {
                const html = await this.fetchPage(url);
                const repos = this.parseActivityData(html);
                this.renderGraph(this.prepareGraphData(repos));
            } catch (error) {
                document.querySelector('.loading').textContent = `Error: ${error.message}`;
            }
        }

        fetchPage(url) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    onload: function(response) {
                        if (response.status === 200) {
                            resolve(response.responseText);
                        } else {
                            reject(new Error(`Failed to load page: ${response.status}`));
                        }
                    },
                    onerror: reject
                });
            });
        }

        parseActivityData(html) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const repos = [];

            //ищем TimelineItem с активностью
            const timelineItems = doc.querySelectorAll('.TimelineItem');
            let activityTimelineItem = null;

            for (const item of timelineItems) {
                const body = item.querySelector('.TimelineItem-body');
                if (body && body.textContent.includes('commits in')) {
                    activityTimelineItem = item;
                    break;
                }
            }

            if (!activityTimelineItem) throw new Error('Activity timeline item not found');

            //находим список репозиториев
            const repoList = activityTimelineItem.querySelector('ul.list-style-none.mt-1');
            if (!repoList) throw new Error('Repository list not found');

            //парсим каждый элемент списка
            const repoItems = repoList.querySelectorAll('li');
            repoItems.forEach(item => {
                const repoLink = item.querySelector('a[data-hovercard-type="repository"]');
                if (!repoLink) return;

                const fullName = repoLink.textContent.trim();
                const progressBar = item.querySelector('.Progress');
                const percentageText = progressBar?.getAttribute('aria-label')?.match(/(\d+)%/);
                const percentage = percentageText ? parseInt(percentageText[1]) : 0;

                if (fullName) {
                    const [owner, name] = fullName.split('/');
                    const isPersonal = owner === this.username;

                    repos.push({
                        owner,
                        name,
                        fullName,
                        commits: percentage, //используем процент как относительное количество коммитов
                        isPersonal
                    });
                }
            });

            return repos;
        }

        prepareGraphData(repos) {
            const nodes = [];
            const links = [];
            const orgs = new Set();

            //добавляем пользователя как центральный узел
            nodes.push({
                id: this.username,
                name: this.username,
                type: 'user',
                size: 30
            });

            //сначала обрабатываем организации
            repos.forEach(repo => {
                if (!repo.isPersonal && !orgs.has(repo.owner)) {
                    nodes.push({
                        id: repo.owner,
                        name: repo.owner,
                        type: 'org',
                        size: 25,
                        url: `https://github.com/${repo.owner}`
                    });
                    orgs.add(repo.owner);

                    //связь пользователь -> организация
                    links.push({
                        source: this.username,
                        target: repo.owner,
                        value: 1
                    });
                }
            });

            //добавляем репозитории
            repos.forEach(repo => {
                nodes.push({
                    id: repo.fullName,
                    name: repo.name,
                    type: 'repo',
                    size: 15 + Math.log(repo.commits + 1) * 3, //размер зависит от процента коммитов
                    url: `https://github.com/${repo.fullName}`,
                    commits: repo.commits
                });

                //связь владелец -> репозиторий
                links.push({
                    source: repo.owner,
                    target: repo.fullName,
                    value: Math.min(repo.commits / 20, 5) //толщина связи зависит от процента
                });
            });

            return { nodes, links };
        }

        renderGraph(graphData) {
            const container = document.getElementById('graph-container');
            container.innerHTML = '';

            const width = container.clientWidth;
            const height = container.clientHeight;

            const svg = d3.select(container)
                .append('svg')
                .attr('width', width)
                .attr('height', height)
                .call(d3.zoom()
                    .scaleExtent([0.1, 8])
                    .on('zoom', (event) => {
                        g.attr('transform', event.transform);
                    }))
                .append('g');

            const g = svg.append('g');

            const simulation = d3.forceSimulation(graphData.nodes)
                .force('link', d3.forceLink(graphData.links).id(d => d.id).distance(d => {
                    if (d.source.type === 'user') return 200;
                    return 150;
                }))
                .force('charge', d3.forceManyBody().strength(-500))
                .force('center', d3.forceCenter(width / 2, height / 2))
                .force('collision', d3.forceCollide().radius(d => d.size + 5));

            const link = g.append('g')
                .attr('class', 'links')
                .selectAll('line')
                .data(graphData.links)
                .enter().append('line')
                .attr('stroke', d => d.source.type === 'user' ? '#6a737d' : '#586069')
                .attr('stroke-width', d => d.value)
                .attr('stroke-opacity', 0.8);

            const node = g.append('g')
                .attr('class', 'nodes')
                .selectAll('g')
                .data(graphData.nodes)
                .enter().append('g')
                .call(d3.drag()
                    .on('start', dragstarted)
                    .on('drag', dragged)
                    .on('end', dragended));

            node.append('circle')
                .attr('r', d => d.size)
                .attr('fill', d => {
                    if (d.type === 'user') return '#28a745';
                    if (d.type === 'org') return '#6f42c1';
                    return '#0366d6';
                })
                .attr('stroke', '#fff')
                .attr('stroke-width', 2)
                .on('click', d => {
                    if (d.url) window.open(d.url, '_blank');
                });

            node.append('text')
                .attr('class', 'node-text')
                .text(d => d.name)
                .attr('x', d => d.size + 5)
                .attr('y', 4)
                .attr('fill', '#fff')
                .attr('font-size', '12px')
                .attr('font-weight', 'bold')
                .attr('text-shadow', '1px 1px 2px #000');

            simulation.on('tick', () => {
                link
                    .attr('x1', d => d.source.x)
                    .attr('y1', d => d.source.y)
                    .attr('x2', d => d.target.x)
                    .attr('y2', d => d.target.y);

                node.attr('transform', d => `translate(${d.x},${d.y})`);
            });

            function dragstarted(event, d) {
                if (!event.active) simulation.alphaTarget(0.3).restart();
                d.fx = d.x;
                d.fy = d.y;
            }

            function dragged(event, d) {
                d.fx = event.x;
                d.fy = event.y;
            }

            function dragended(event, d) {
                if (!event.active) simulation.alphaTarget(0);
                d.fx = null;
                d.fy = null;
            }
        }

        init() {
            if (this.isProfilePage()) {
                this.addNavItem();
            } else if (this.isLinkRepoPage()) {
                this.createPage();
                this.loadActivityData();
            }
        }
    }

    if (document.readyState === 'complete') {
        new MonthlyRepoGraph();
    } else {
        window.addEventListener('load', () => {
            new MonthlyRepoGraph();
        });
    }

    window.addEventListener('popstate', () => {
        new MonthlyRepoGraph();
    });
})();