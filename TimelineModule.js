const TimelineModule = {
    minimapTimeout: null,
    triggerMinimap() {
        const mm = document.getElementById('minimap'); mm.classList.add('visible');
        clearTimeout(this.minimapTimeout); this.minimapTimeout = setTimeout(() => mm.classList.remove('visible'), 2000);
    },
    renderTrackStructure() {
        const container = document.getElementById('tracksContainer');
        if(container.childElementCount === Store.trackConfig.length) return; 
        
        let firstAudioFound = false;
        container.innerHTML = Store.trackConfig.map(t => {
            if (!t) return '';
            const isAudio = t.type === 'audio';
            let extraClasses = '';
            let labelClasses = '';
            if (isAudio) {
                extraClasses += ' bg-[#121412]';
                labelClasses += ' text-emerald-500/50';
                if (!firstAudioFound) {
                    extraClasses += ' border-t-4 border-t-[#1f2924] mt-2'; 
                    firstAudioFound = true;
                }
            }
            return `
                <div class="track-row ${extraClasses}" id="row-${t.id}" data-id="${t.id}" data-type="${t.type}">
                    <div class="track-header ${labelClasses}"><i class="fa-solid ${t.icon} mr-2"></i> ${t.label}</div>
                    <div class="track-lane" id="track-${t.id}"></div>
                </div>
            `;
        }).join('');
    },
    openAddTrackModal() { document.getElementById('addTrackModal').classList.remove('hidden'); },
    addTrack(type) {
        const existingOfType = Store.trackConfig.filter(t => t && t.type === type).length;
        let prefix = 'v'; let label = 'Video'; let icon = 'fa-video';
        if (type === 'audio') { prefix = 'a'; label = 'Audio'; icon = 'fa-music'; }
        if (type === 'text') { prefix = 't'; label = 'Text'; icon = 'fa-font'; }
        if (type === 'fx') { prefix = 'fx'; label = 'FX Overlay'; icon = 'fa-wand-magic-sparkles'; }
        const newId = `${prefix}${Date.now().toString().slice(-4)}`;
        const newTrack = { id: newId, type: type, label: `${label} ${existingOfType + 1}`, icon: icon, createdAt: Date.now() };
        Store.trackConfig.push(newTrack);
        Store.tracks[newId] = []; 
        Store.sortTracks();
        Store.saveState(); 
        document.getElementById('addTrackModal').classList.add('hidden');
        UI.refreshTimeline(); 
    },
    updateContainerWidth() {
        const w = Store.getTotalDuration() * Store.zoom;
        Store.trackConfig.forEach(t => { 
            if (!t) return;
            const el = document.getElementById(`track-${t.id}`);
            if(el) el.style.width = `${w}px`; 
        });
    },
    handleGlobalDrop(e) {
        e.preventDefault(); const assetId = e.dataTransfer.getData('assetId'); if(!assetId) return;
        const asset = Store.assets.find(a => a && a.id === assetId); if(!asset) return;
        const tracksRect = document.getElementById('tracksContainer').getBoundingClientRect();
        const relativeY = e.clientY - tracksRect.top;
        
        let yOffset = 0;
        let trackIndex = -1;
        const trackRows = document.querySelectorAll('.track-row');
        for (let i = 0; i < trackRows.length; i++) {
            yOffset += trackRows[i].offsetHeight;
            const mt = window.getComputedStyle(trackRows[i]).marginTop;
            if (mt) yOffset += parseFloat(mt);
            
            if (relativeY <= yOffset) {
                trackIndex = i;
                break;
            }
        }
        
        if (trackIndex >= 0 && trackIndex < Store.trackConfig.length) {
            const targetTrack = Store.trackConfig[trackIndex];
            if (!targetTrack) return;
            let compatible = false;
            if ((asset.type === 'video' || asset.type === 'image') && (targetTrack.type === 'video' || targetTrack.type === 'fx')) compatible = true;
            if (asset.type === 'audio' && targetTrack.type === 'audio') compatible = true;
            if (asset.type === 'title' && targetTrack.type === 'text') compatible = true;
            if (compatible) {
                 const containerScroll = document.getElementById('tracksScrollArea').scrollLeft;
                 const x = (e.clientX - document.getElementById('timelineWrapper').getBoundingClientRect().left - 100 + containerScroll);
                 const time = Math.max(0, x / Store.zoom);
                 Store.addClip(targetTrack.id, assetId, time);
                 UI.refreshTimeline();
                 Player.safeRenderFrame();
            } else {
                alert(`Cannot drop ${asset.type} onto ${targetTrack.label} track.`);
            }
        }
    },
    renderTrack(trackId) {
        const lane = document.getElementById(`track-${trackId}`); 
        if(!lane) return;
        lane.innerHTML = '';
        const trackData = Store.tracks[trackId] || [];
        trackData.forEach(clip => {
            if (!clip) return;
            const asset = Store.assets.find(a => a && a.id === clip.assetId);
            if (!asset) return; 
            
            const el = document.createElement('div'); el.className = `t-clip ${asset.type}`;
            const trackType = Store.trackConfig.find(t => t && t.id === trackId)?.type;
            if(trackType === 'fx') el.classList.add('fx');
            if(Store.selectedClipId === clip.id) el.classList.add('selected');
            el.style.left = `${clip.start * Store.zoom}px`; 
            el.style.width = `${clip.duration * Store.zoom}px`;
            
            el.innerHTML = `<div class="resize-handle left" data-side="left"></div><span class="truncate px-2 pointer-events-none w-full text-center">${asset.name}</span><div class="resize-handle right" data-side="right"></div>`;
            
            el.addEventListener('click', (e) => { e.stopPropagation(); this.selectClip(clip.id, trackId); });
            el.addEventListener('mousedown', e => {
                if(e.target.classList.contains('resize-handle')) this.startResize(e, clip, trackId, e.target.dataset.side);
                else this.startDrag(e, clip, trackId);
            });
            lane.appendChild(el);
        });
        this.renderMinimap();
    },
    renderMinimap() {
        const mapContent = document.getElementById('minimapContent'); const viewport = document.getElementById('minimapViewport');
        const container = document.getElementById('tracksScrollArea');
        let maxTime = Store.getTotalDuration();
        mapContent.innerHTML = '';
        const trackHeightPct = 100 / Store.trackConfig.length;
        Store.trackConfig.forEach((t, i) => {
            if (!t) return;
            const trackData = Store.tracks[t.id] || [];
            trackData.forEach(c => {
                if (!c) return;
                const mClip = document.createElement('div'); mClip.className = 'minimap-clip';
                mClip.style.left = `${(c.start / maxTime) * 100}%`; mClip.style.width = `${(c.duration / maxTime) * 100}%`;
                mClip.style.top = `${i * trackHeightPct}%`; mClip.style.height = `${trackHeightPct}%`; 
                let color = '#555';
                if(t.type === 'video') color = '#3b82f6';
                else if(t.type === 'image') color = '#60a5fa';
                else if(t.type === 'audio') color = '#10b981';
                else if(t.type === 'text') color = '#8b5cf6';
                else if(t.type === 'fx') color = '#f59e0b';
                mClip.style.backgroundColor = color;
                mapContent.appendChild(mClip);
            });
        });
        const totalPx = maxTime * Store.zoom;
        const visiblePx = container.clientWidth;
        const viewWidthPct = Math.min(100, (visiblePx / totalPx) * 100);
        const viewLeftPct = (container.scrollLeft / totalPx) * 100;
        viewport.style.width = `${viewWidthPct}%`; viewport.style.left = `${viewLeftPct}%`;
    },
    selectClip(clipId, trackId) {
        Store.selectedClipId = clipId; Store.selectedTrackId = trackId;
        Store.trackConfig.forEach(t => t && this.renderTrack(t.id));
        document.getElementById('deleteBtn').disabled = false; document.getElementById('splitBtn').disabled = false;
    },
    deleteSelected() {
        if(!Store.selectedClipId) return;
        Store.deleteSelected();
        UI.refreshTimeline();
        Player.safeRenderFrame();
        document.getElementById('deleteBtn').disabled = true;
        document.getElementById('splitBtn').disabled = true;
        if(typeof NativeInspector !== 'undefined') NativeInspector.render();
    },
    startDrag(e, clip, trackId) {
        e.stopPropagation(); 
        this.selectClip(clip.id, trackId);
        const startX = e.clientX; 
        const originalStart = clip.start;
        const asset = Store.assets.find(a => a && a.id === clip.assetId);
        if (!asset) return; 
        
        let currentTrackId = trackId;
        document.body.style.cursor = 'grabbing';
        this.triggerMinimap();
        const tracksContainer = document.getElementById('tracksContainer');
        const onMove = (ev) => {
            const diff = ev.clientX - startX; 
            clip.start = Math.max(0, originalStart + (diff / Store.zoom));
            const tracksRect = tracksContainer.getBoundingClientRect();
            const relativeY = ev.clientY - tracksRect.top;
            
            let yOffset = 0;
            let trackIndex = -1;
            const trackRows = document.querySelectorAll('.track-row');
            for (let i = 0; i < trackRows.length; i++) {
                yOffset += trackRows[i].offsetHeight;
                const mt = window.getComputedStyle(trackRows[i]).marginTop;
                if (mt) yOffset += parseFloat(mt);
                if (relativeY <= yOffset) { trackIndex = i; break; }
            }

            if (trackIndex >= 0 && trackIndex < Store.trackConfig.length) {
                const targetTrack = Store.trackConfig[trackIndex];
                if (targetTrack) {
                    const targetId = targetTrack.id;
                    let compatible = false;
                    if ((asset.type === 'video' || asset.type === 'image') && (targetTrack.type === 'video' || targetTrack.type === 'fx')) compatible = true;
                    if (asset.type === 'audio' && targetTrack.type === 'audio') compatible = true;
                    if (asset.type === 'title' && targetTrack.type === 'text') compatible = true;
                    if (compatible && targetId !== currentTrackId) {
                        Store.moveClip(clip.id, currentTrackId, targetId);
                        this.renderTrack(currentTrackId); 
                        currentTrackId = targetId; 
                        this.renderTrack(currentTrackId); 
                    }
                }
            }
            Store.resolveDragCollision(currentTrackId, clip, clip.start); 
            this.renderTrack(currentTrackId); 
            Player.safeRenderFrame();
        };
        const onUp = () => { 
            document.removeEventListener('mousemove', onMove); 
            document.removeEventListener('mouseup', onUp); 
            document.body.style.cursor = 'default'; 
            Store.saveState(); 
        };
        document.addEventListener('mousemove', onMove); 
        document.addEventListener('mouseup', onUp);
    },
    startResize(e, clip, trackId, side) {
        e.stopPropagation(); e.preventDefault();
        const startX = e.clientX; const originalStart = clip.start; const originalDuration = clip.duration; const originalOffset = clip.offset;
        const asset = Store.assets.find(a => a && a.id === clip.assetId); 
        if (!asset) return; 
        
        const isMedia = asset.type === 'video' || asset.type === 'audio';
        document.body.style.cursor = 'col-resize';
        this.triggerMinimap();
        const onMove = (ev) => {
            const diffSec = (ev.clientX - startX) / Store.zoom;
            if (side === 'right') {
                let newDur = Math.max(0.5, originalDuration + diffSec);
                if (isMedia && (originalOffset + newDur) > asset.duration) newDur = asset.duration - originalOffset;
                clip.duration = newDur; Store.resolveResizeCollision(trackId, clip, clip.id);
            } else {
                let newStart = originalStart + diffSec; let newDur = originalDuration - diffSec; let newOffset = originalOffset + diffSec;
                if (newOffset < 0) { newOffset = 0; const delta = 0 - originalOffset; newStart = originalStart + delta; newDur = originalDuration - delta; }
                if (newDur < 0.5) { newDur = 0.5; newStart = (originalStart + originalDuration) - 0.5; newOffset = (originalOffset + originalDuration) - 0.5; }
                if (newStart < 0) { const overshot = 0 - newStart; newStart = 0; newDur -= overshot; newOffset += overshot; }
                clip.start = newStart; clip.duration = newDur; clip.offset = newOffset;
            }
            this.renderTrack(trackId);
        };
        const onUp = () => { 
            document.removeEventListener('mousemove', onMove); 
            document.removeEventListener('mouseup', onUp); 
            document.body.style.cursor = 'default';
            Store.saveState(); 
        };
        document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
    },
    splitClip() {
        const time = Store.currentTime; const trackId = Store.selectedTrackId; if (!trackId) return;
        const trackData = Store.tracks[trackId] || [];
        const idx = trackData.findIndex(c => c && time > c.start && time < (c.start + c.duration)); if(idx === -1) return;
        const original = trackData[idx]; const newDuration = time - original.start; const remainingDuration = original.duration - newDuration;
        if(remainingDuration < 0.1) return;
        original.duration = newDuration;
        const secondHalf = { ...original, id: 'clip_' + Date.now(), start: time, duration: remainingDuration, offset: original.offset + newDuration, graphData: original.graphData ? JSON.parse(JSON.stringify(original.graphData)) : null };
        trackData.splice(idx + 1, 0, secondHalf);
        this.renderTrack(trackId); this.selectClip(secondHalf.id, trackId);
        Store.saveState(); 
        UI.checkExportButton();
    },
    updatePlayhead(time) { 
        const container = document.getElementById('tracksScrollArea');
        const scrollX = container ? container.scrollLeft : 0;
        const pos = (time * Store.zoom) - scrollX;
        const el = document.getElementById('playhead');
        if(el) el.style.transform = `translateX(${pos}px)`; 
    }
};
