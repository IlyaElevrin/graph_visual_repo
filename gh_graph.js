// ==UserScript==
// @name         GitHub Contribution Graph
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Visualizes GitHub repositories with recent contributions using API
// @author       IlyaElevrin
// @match        https://github.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @require      https://d3js.org/d3.v7.min.js
// @connect      api.github.com
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    class ContributionGraph {
        constructor() {
            this.username = this._getUsername();
            this.repos = [];
            this._init();
        }

        _getUsername() {
            const pathParts = window.location.pathname.split('/');
            return pathParts[1] || null;
        }

        _isProfilePage() {
            return !!document.querySelector('.js-profile-editable-area') &&
                   !this._isLinkRepoPage();
        }

        _isLinkRepoPage() {
            return window.location.pathname.endsWith('/linkrepo');
        }

        _addNavItem() {
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
            span.textContent = 'Contribution Graph';

            link.appendChild(span);
            navItem.appendChild(link);

            const moreButton = document.querySelector('.UnderlineNav-item[data-tab-item="more"]');
            if (moreButton) {
                moreButton.parentNode.insertBefore(navItem, moreButton);
            } else {
                navContainer.appendChild(navItem);
            }
        }

        _createFullscreenPage() {
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
            title.textContent = `Contribution Graph: ${this.username} (last month)`;

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
            `;
            loading.textContent = 'Loading repositories...';

            header.appendChild(title);
            header.appendChild(closeBtn);
            container.appendChild(loading);
            app.appendChild(header);
            app.appendChild(container);
            document.body.appendChild(app);

            closeBtn.addEventListener('click', () => {
                window.location.href = `/${this.username}`;
            });
        }

        async _loadAllRepositories() {
            const loading = document.querySelector('.loading');
            try {
                loading.textContent = 'Fetching recent contributions...';

                //getting the user's events for the last month
                const events = await this._fetchRecentEvents();

                //extracting unique repositories from events
                const repos = this._extractReposFromEvents(events);

                if (repos.length > 0) {
                    this._renderFullscreenGraph(this._prepareGraphData(repos));
                } else {
                    throw new Error('No recent contributions found');
                }
            } catch (error) {
                loading.textContent = `Error: ${error.message}`;
                console.error(error);
            }
        }

        async _fetchRecentEvents() {
            const oneMonthAgo = new Date();
            oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
            const sinceDate = oneMonthAgo.toISOString();

            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: `https://api.github.com/users/${this.username}/events?per_page=100`,
                    headers: {
                        'Accept': 'application/vnd.github.v3+json'
                    },
                    onload: function(response) {
                        if (response.status === 200) {
                            resolve(JSON.parse(response.responseText));
                        } else {
                            reject(new Error(`Failed to load events: ${response.status}`));
                        }
                    },
                    onerror: reject
                });
            });
        }

        _extractReposFromEvents(events) {
            const reposMap = new Map();

            events.forEach(event => {
                if (event.repo) {
                    const [owner, name] = event.repo.name.split('/');
                    const repoKey = `${owner}/${name}`;

                    if (!reposMap.has(repoKey)) {
                        reposMap.set(repoKey, {
                            name,
                            owner,
                            isFork: false, //can't determine this from the events, can add an additional query.
                            isPersonal: owner === this.username,
                            lastActivity: new Date(event.created_at)
                        });
                    }
                }
            });

            return Array.from(reposMap.values());
        }

        _prepareGraphData(repos) {
            const nodes = [];
            const links = [];
            const orgs = new Map();

            //central node is the user
            nodes.push({
                id: this.username,
                name: this.username,
                type: 'user',
                size: 30
            });

            //add organizations
            repos.forEach(repo => {
                if (!repo.isPersonal && !orgs.has(repo.owner)) {
                    nodes.push({
                        id: repo.owner,
                        name: repo.owner,
                        type: 'org',
                        size: 25,
                        url: `https://github.com/${repo.owner}`
                    });
                    orgs.set(repo.owner, true);

                    links.push({
                        source: this.username,
                        target: repo.owner,
                        value: 1
                    });
                }
            });

            // add repo
            repos.forEach(repo => {
                const repoId = `${repo.owner}/${repo.name}`;

                nodes.push({
                    id: repoId,
                    name: repo.name,
                    type: 'repo',
                    fork: repo.isFork,
                    size: 20,
                    url: `https://github.com/${repoId}`,
                    lastActivity: repo.lastActivity
                });

                links.push({
                    source: repo.isPersonal ? this.username : repo.owner,
                    target: repoId,
                    value: 2
                });
            });

            return { nodes, links };
        }

        _renderFullscreenGraph(graphData) {
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
                .force('link', d3.forceLink(graphData.links).id(d => d.id).distance(150))
                .force('charge', d3.forceManyBody().strength(-400))
                .force('center', d3.forceCenter(width / 2, height / 2))
                .force('collision', d3.forceCollide().radius(d => d.size + 10));

            const link = g.append('g')
                .attr('class', 'links')
                .selectAll('line')
                .data(graphData.links)
                .enter().append('line')
                .attr('stroke', d => d.value === 1 ? '#6a737d' : '#586069')
                .attr('stroke-width', d => d.value === 1 ? 1.5 : 2);

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
                    return d.fork ? '#6a737d' : '#0366d6';
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
                .attr('y', 4);

            //adding tooltips with the date of the last activity
            node.append('title')
                .text(d => d.lastActivity ? `Last activity: ${new Date(d.lastActivity).toLocaleDateString()}` : '');

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

        _init() {
            if (this._isProfilePage()) {
                this._addNavItem();
            } else if (this._isLinkRepoPage()) {
                this._createFullscreenPage();
                this._loadAllRepositories();
            }
        }
    }

    if (document.readyState === 'complete') {
        new ContributionGraph();
    } else {
        window.addEventListener('load', () => {
            new ContributionGraph();
        });
    }

    window.addEventListener('popstate', () => {
        new ContributionGraph();
    });
})();
