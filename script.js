// --- Globals ---
const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');

let gridSize = 20;
let cellSize = 22;
let numStates = 2;
let grid = [];

let savedGrid = null;
let isRunning = false;
let intervalId = null;

const MAX_HISTORY = 100;
let historyStack = [];

// Stores custom symbols for each state ["0", "1", "A", "X"...]
let stateLabels = [];

// Palette (-1 = '?', 0-10 = states)
let activeTool = 1; 
let selectFirstMode = false;
let selectedTarget = null;

// Rules storage
let rules = [];

// Colors configuration
const stateStyles = [
	{ bg: '#FFFFFF', text: '#000000' }, // 0
	{ bg: '#000000', text: '#FFFFFF' }, // 1
	{ bg: '#FF0000', text: '#FFFFFF' }, // 2
	{ bg: '#00FF00', text: '#000000' }, // 3
	{ bg: '#0000FF', text: '#FFFFFF' }, // 4
	{ bg: '#FFFF00', text: '#000000' }, // 5
	{ bg: '#00FFFF', text: '#000000' }, // 6
	{ bg: '#FF00FF', text: '#FFFFFF' }, // 7
	{ bg: '#808080', text: '#FFFFFF' }, // 8
	{ bg: '#FFA500', text: '#000000' }, // 9
	{ bg: '#800080', text: '#FFFFFF' }  // 10
];

let editorInputs = []; 
let editorResult = 0;

// --- Initialization ---

function initGrid() {
	stopSimulation();
	
	const sizeEl = document.getElementById('gridSize');
	const statesEl = document.getElementById('numStates');
	
	if (sizeEl) {
		gridSize = parseInt(sizeEl.value);
		if (gridSize > 40) gridSize = 40;
		if (gridSize < 1) gridSize = 1;
	}

	if (statesEl) {
		numStates = parseInt(statesEl.value);
		if (numStates > 11) numStates = 11;
		if (numStates < 2) numStates = 2;
	}

	canvas.width = gridSize * cellSize;
	canvas.height = gridSize * cellSize;
	
	// Init Labels (Default to numbers 0, 1, 2...)
	stateLabels = [];
	for(let i=0; i<numStates; i++) {
		stateLabels.push(i.toString());
	}
	
	grid = Array(gridSize).fill().map(() => Array(gridSize).fill(0));
	clearHistory();
	rules = [];
	editorResult = 0;
	selectedTarget = null;
	
	renderSymbolEditor(); // Create inputs for symbols
	updateAddStateButton();
	renderPalette();
	renderRuleList();
	updateRuleEditorUI();
	updateResultDisplay();
	draw();
}

// --- Symbol Editor Logic (New) ---

function renderSymbolEditor() {
	const container = document.getElementById('symbolTableContainer');
	if (!container) return;
	container.innerHTML = '';
	
	for (let i = 0; i < numStates; i++) {
		const row = document.createElement('div');
		row.className = 'symbol-row';
		
		// Color Box
		const colorBox = document.createElement('div');
		colorBox.className = 'symbol-color';
		colorBox.style.backgroundColor = stateStyles[i].bg;
		
		// Input Field
		const input = document.createElement('input');
		input.type = 'text';
		input.className = 'symbol-input';
		input.maxLength = 2; // Limit to 2 chars
		input.value = stateLabels[i];
		input.dataset.idx = i;
		
		// Event: Update label on change
		input.addEventListener('input', (e) => {
			const idx = parseInt(e.target.dataset.idx);
			stateLabels[idx] = e.target.value;
			
			// Refresh all visuals that use labels
			renderPalette(); 
			updateRuleEditorUI(); // Refreshes mini-grid
			updateResultDisplay();
			renderRuleList();
			draw();
		});
		
		row.appendChild(colorBox);
		row.appendChild(input);
		container.appendChild(row);
	}
}

// --- Symbol Editor Logic ---

function updateAddStateButton() {
	const btn = document.getElementById('btnAddState');
	if (btn) {
		btn.disabled = numStates >= stateStyles.length;
	}
}

function addState() {
	if (numStates >= stateStyles.length) return;

	stateLabels.push(numStates.toString());
	numStates++;

	const statesEl = document.getElementById('numStates');
	if (statesEl) {
		statesEl.value = numStates;
	}

	renderSymbolEditor();
	renderPalette();
	updateAddStateButton();
}

// --- Palette ---

function renderPalette() {
	const container = document.getElementById('paletteContainer');
	if (!container) return;
	container.innerHTML = '';
	
	// Colors (-1 = '?' for wildcard, 0-10 = states)
	for (let i = -1 ; i < numStates; i++) {
		container.appendChild(createPaletteBtn(i));
	}
}

function createPaletteBtn(stateVal) {
	const btn = document.createElement('div');
	btn.className = 'palette-btn';
	
	if (stateVal === -1) {
		btn.innerText = '?';
		btn.style.backgroundColor = '#a1a0a0';
		btn.style.color = '#000000';
	} else {
		// Use custom label
		btn.innerText = stateLabels[stateVal];
		btn.style.backgroundColor = stateStyles[stateVal].bg;
		btn.style.color = stateStyles[stateVal].text;
	}
	
	if (!selectFirstMode && activeTool === stateVal) btn.classList.add('selected');

	btn.addEventListener('click', () => {
		if (selectFirstMode) {
			applyStateToSelected(stateVal);
			return;
		}
		activeTool = stateVal;
		document.querySelectorAll('.palette-btn').forEach(b => b.classList.remove('selected'));
		btn.classList.add('selected');
	});

	return btn;
}

// --- Rule Editor & Visuals ---

function updateRuleEditorUI() {
	const typeEl = document.getElementById('neighborhood');
	const container = document.getElementById('inputGrid');
	if (!typeEl || !container) return;
	
	const type = typeEl.value;
	container.innerHTML = '';
	
	if (type === 'moore') {
		container.style.gridTemplateColumns = 'repeat(3, 30px)';
		// Only reset inputs if size changed, but here we just rebuild UI
		if (editorInputs.length !== 9) editorInputs = Array(9).fill(-1);
		
		for (let i = 0; i < 9; i++) {
			createEditorCell(i, container, i === 4);
		}
	} else {
		container.style.gridTemplateColumns = 'repeat(3, 30px)';
		if (editorInputs.length !== 5) editorInputs = Array(5).fill(-1);
		
		const activeIndices = [1, 3, 4, 5, 7]; 
		const logicalMap = {1:0, 3:1, 4:2, 5:3, 7:4}; 
		
		for (let i = 0; i < 9; i++) {
			if (activeIndices.includes(i)) {
				createEditorCell(logicalMap[i], container, i === 4);
			} else {
				const spacer = document.createElement('div');
				spacer.style.width = '30px';
				spacer.style.height = '30px';
				container.appendChild(spacer);
			}
		}
	}

	if (selectedTarget 
			&& selectedTarget.area === 'rule' 
			&& selectedTarget.index >= editorInputs.length) {
		selectedTarget = null;
	}
}

function createEditorCell(index, container, isCenter) {
	const btn = document.createElement('div');
	btn.className = 'cell-btn';
	btn.dataset.index = index;
	if (isCenter) btn.style.border = '2px solid red';
	if (selectFirstMode && selectedTarget && selectedTarget.area === 'rule' && selectedTarget.index === index) {
		btn.classList.add('cell-selected');
	}

	renderCellVisuals(btn, editorInputs[index]);

	btn.addEventListener('click', () => {
		if (selectFirstMode) {
			selectedTarget = { area: 'rule', index };
			refreshSelectionVisuals();
			return;
		}
		editorInputs[index] = activeTool;
		renderCellVisuals(btn, activeTool);
	});

	container.appendChild(btn);
}

function updateResultDisplay() {
	const display = document.getElementById('ruleResultDisplay');
	if (!display) return;
	display.style.border = '2px solid red';
	
	display.onclick = () => {
		if (selectFirstMode) {
			selectedTarget = { area: 'result' };
			refreshSelectionVisuals();
			return;
		}
		if (activeTool !== -1) {
			editorResult = activeTool;
			renderCellVisuals(display, editorResult);
		}
	};
	renderCellVisuals(display, editorResult);
}

function renderCellVisuals(element, stateVal) {
	if (stateVal === -1) {
		element.style.backgroundColor = '#eeeeee';
		element.style.color = '#333';
		element.innerText = '?';
	} else {
		if (stateVal >= numStates) stateVal = 0;
		element.style.backgroundColor = stateStyles[stateVal].bg;
		element.style.color = stateStyles[stateVal].text;
		// USE CUSTOM LABEL
		element.innerText = stateLabels[stateVal];
	}
}

// --- Rule Management ---

function addRule() {
	const pattern = [...editorInputs];
	let result = editorResult;
	if (result === -1) result = 0;
	
	const type = document.getElementById('neighborhood').value;
	
	rules.push({ pattern, result, type });
	renderRuleList();
}

function deleteRule(index) {
	rules.splice(index, 1);
	renderRuleList();
}

function moveRule(index, direction) {
	const targetIndex = index + direction;
	if (targetIndex < 0 || targetIndex >= rules.length) return;

	[rules[index], rules[targetIndex]] = [rules[targetIndex], rules[index]];
	renderRuleList();
}

function renderRuleList() {
	const list = document.getElementById('ruleListContainer');
	if (!list) return;
	list.innerHTML = '';

	let boundary = document.getElementById('boundary').value;

	const comment = document.createElement('div');
	comment.className = 'rule-comment';
	comment.innerText = 'Comment: \nRules are evaluated in order,\nthe first match is applied.';
	if (boundary !== 'periodic') {
		comment.innerText += '\nOut of bounds = state 0.';
	}
	comment.style.fontStyle = 'italic';
	comment.style.color = '#555';
	comment.style.marginBottom = '10px';
	list.appendChild(comment);
	
	if (rules.length === 0) {
		list.innerHTML = '<div style="padding:10px; color:#999; text-align:center;">No rules defined.<br>Default: Keep State.</div>';
		return;
	}

	

	rules.forEach((rule, idx) => {
		const item = document.createElement('div');
		item.className = 'rule-item';

		// Label with index of the rule
		const ruleLabel = document.createElement('span');
		ruleLabel.className = 'rule-index';
		ruleLabel.innerText = `rule number ${idx + 1}: `; 
				
		// Visual representation of the rule
		const vizContainer = document.createElement('div');
		vizContainer.className = 'rule-visual-container';
		
		// Mini Grid
		const gridDiv = document.createElement('div');
		gridDiv.className = 'mini-preview';
		gridDiv.style.gridTemplateColumns = 'repeat(3, 10px)';
		gridDiv.style.gridTemplateRows = 'repeat(3, 10px)';

		for(let i=0; i<9; i++) {
			const cell = document.createElement('div');
			cell.className = 'preview-cell';
			
			let stateVal = -2; // spacer
			
			if (rule.type === 'moore') {
				stateVal = rule.pattern[i];
			} else {
				const vnMap = {1:0, 3:1, 4:2, 5:3, 7:4};
				if (vnMap.hasOwnProperty(i)) {
					stateVal = rule.pattern[vnMap[i]];
				}
			}
			
			if (stateVal === -2) {
				cell.style.backgroundColor = 'transparent'; 
			} else if (stateVal === -1) {
				cell.style.backgroundColor = '#ddd'; 
				cell.innerText = '?';
			} else {
				if(stateVal >= numStates) stateVal = 0;
				cell.style.backgroundColor = stateStyles[stateVal].bg;
				cell.style.color = stateStyles[stateVal].text;
				cell.innerText = stateLabels[stateVal];
			}
			gridDiv.appendChild(cell);
		}
		
		const arrow = document.createElement('div');
		arrow.className = 'preview-arrow';
		arrow.innerHTML = '&rarr;';
		
		const resBox = document.createElement('div');
		resBox.className = 'preview-result';
		resBox.style.backgroundColor = stateStyles[rule.result].bg;
		resBox.style.color = stateStyles[rule.result].text;
		resBox.innerText = stateLabels[rule.result]; // Use Label
		
		vizContainer.appendChild(gridDiv);
		vizContainer.appendChild(arrow);
		vizContainer.appendChild(resBox);
		
		const actionsDiv = document.createElement('div');
		actionsDiv.className = 'rule-actions';

		const upBtn = document.createElement('button');
		upBtn.className = 'move-btn';
		upBtn.innerHTML = '&uarr;';
		upBtn.title = 'Move up';
		upBtn.disabled = idx === 0;
		upBtn.addEventListener('click', () => moveRule(idx, -1));

		const downBtn = document.createElement('button');
		downBtn.className = 'move-btn';
		downBtn.innerHTML = '&darr;';
		downBtn.title = 'Move down';
		downBtn.disabled = idx === rules.length - 1;
		downBtn.addEventListener('click', () => moveRule(idx, 1));

		const delBtn = document.createElement('button');
		delBtn.className = 'delete-btn';
		delBtn.innerText = 'X';
		delBtn.title = 'Delete rule';
		delBtn.addEventListener('click', () => deleteRule(idx));

		actionsDiv.appendChild(upBtn);
		actionsDiv.appendChild(downBtn);
		actionsDiv.appendChild(delBtn);

		item.appendChild(ruleLabel);
		item.appendChild(vizContainer);
		item.appendChild(actionsDiv);
		list.appendChild(item);
	});
}

// --- Simulation Logic ---

function getNeighbors(gridSnapshot, x, y, type) {
	const h = gridSize;
	const w = gridSize;
	const boundary = document.getElementById('boundary').value;
	const vals = [];

	let offsets;
	if (type === 'moore') {
		offsets = [[-1,-1], [0,-1], [1,-1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
	} else {
		offsets = [[0,-1], [-1, 0], [0, 0], [1, 0], [0, 1]];
	}

	for (let o of offsets) {
		let nx = x + o[0];
		let ny = y + o[1];
		let val = 0; 

		if (boundary === 'periodic') {
			nx = (nx + w) % w;
			ny = (ny + h) % h;
			val = gridSnapshot[ny][nx]; 
		} else {
			if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
				val = gridSnapshot[ny][nx];
			}
		}
		vals.push(val);
	}
	return vals;
}

function checkMatch(pattern, neighbors) {
	if (pattern.length !== neighbors.length) return false;
	for (let i = 0; i < pattern.length; i++) {
		if (pattern[i] === -1) continue;
		if (pattern[i] !== neighbors[i]) return false;
	}
	return true;
}

// function step() {
// 	const currentGridSnapshot = grid.map(row => [...row]);
// 	historyStack.push(currentGridSnapshot);
// 	if (historyStack.length > MAX_HISTORY) {
// 		historyStack.shift();
// 	}
// 	const nextGrid = Array(gridSize).fill().map(() => Array(gridSize).fill(0));
// 	const type = document.getElementById('neighborhood').value;

// 	for (let y = 0; y < gridSize; y++) {
// 		for (let x = 0; x < gridSize; x++) {
// 			const neighbors = getNeighbors(currentGridSnapshot, x, y, type);
// 			let matchFound = false;
// 			for (let rule of rules) {
// 				if(rule.type !== type) continue; 
// 				if (checkMatch(rule.pattern, neighbors)) {
// 					nextGrid[y][x] = rule.result;
// 					matchFound = true;
// 					break;
// 				}
// 			}
// 			if (!matchFound) {
// 				nextGrid[y][x] = currentGridSnapshot[y][x];
// 			}
// 		}
// 	}
// 	grid = nextGrid;
// 	draw();
// 	updateStepBackButton();
// }

function computeNextGrid(sourceGrid) {
	const nextGrid = Array(gridSize).fill().map(() => Array(gridSize).fill(0));
	const type = document.getElementById('neighborhood').value;

	for (let y = 0; y < gridSize; y++) {
		for (let x = 0; x < gridSize; x++) {
			const neighbors = getNeighbors(sourceGrid, x, y, type);
			let matchFound = false;
			for (let rule of rules) {
				if (rule.type !== type) continue;
				if (checkMatch(rule.pattern, neighbors)) {
					nextGrid[y][x] = rule.result;
					matchFound = true;
					break;
				}
			}
			if (!matchFound) {
				nextGrid[y][x] = sourceGrid[y][x];
			}
		}
	}
	return nextGrid;
}

function step() {
	const currentGridSnapshot = grid.map(row => [...row]);
	historyStack.push(currentGridSnapshot);
	if (historyStack.length > MAX_HISTORY) {
		historyStack.shift();
	}
	grid = computeNextGrid(currentGridSnapshot);
	draw();
}


// --- Interaction ---

function toggleSelectFirstMode(e) {
	selectFirstMode = e.target.checked;
	e.target.blur();
	selectedTarget = null;
	renderPalette();
	refreshSelectionVisuals();
}

function refreshSelectionVisuals() {
	document.querySelectorAll('#inputGrid .cell-btn').forEach(btn => {
		const idx = parseInt(btn.dataset.index, 10);
		const isSelected = selectFirstMode && selectedTarget && selectedTarget.area === 'rule' && selectedTarget.index === idx;
		btn.classList.toggle('cell-selected', Boolean(isSelected));
	});

	const resDisplay = document.getElementById('ruleResultDisplay');
	if (resDisplay) {
		const isResSelected = selectFirstMode && selectedTarget && selectedTarget.area === 'result';
		resDisplay.classList.toggle('cell-selected', Boolean(isResSelected));
	}

	draw();
}

function applyStateToSelected(stateVal) {
	if (!selectedTarget) return;

	if (selectedTarget.area === 'canvas') {
		if (stateVal === -1 || stateVal >= numStates) return;
		if (!isRunning) clearHistory();
		grid[selectedTarget.y][selectedTarget.x] = stateVal;
		draw();
	} else if (selectedTarget.area === 'rule') {
		if (stateVal >= numStates) return;
		editorInputs[selectedTarget.index] = stateVal;
		const cell = document.querySelector(`#inputGrid .cell-btn[data-index="${selectedTarget.index}"]`);
		if (cell) renderCellVisuals(cell, stateVal);
	} else if (selectedTarget.area === 'result') {
		if (stateVal === -1 || stateVal >= numStates) return;
		editorResult = stateVal;
		updateResultDisplay();
	}
}

function moveSelection(dx, dy) {
	if (!selectedTarget) return;

	if (selectedTarget.area === 'canvas') {
		selectedTarget.x = Math.max(0, Math.min(gridSize - 1, selectedTarget.x + dx));
		selectedTarget.y = Math.max(0, Math.min(gridSize - 1, selectedTarget.y + dy));
		refreshSelectionVisuals();
	} else if (selectedTarget.area === 'rule') {
		const type = document.getElementById('neighborhood').value;
		if (type === 'moore') {
			const col = Math.max(0, Math.min(2, (selectedTarget.index % 3) + dx));
			const row = Math.max(0, Math.min(2, Math.floor(selectedTarget.index / 3) + dy));
			selectedTarget.index = row * 3 + col;
			refreshSelectionVisuals();
		} else {
			const vnCoords = [
				{ x: 1, y: 0 },
				{ x: 0, y: 1 },
				{ x: 1, y: 1 },
				{ x: 2, y: 1 },
				{ x: 1, y: 2 }
			];
			const cur = vnCoords[selectedTarget.index];
			const nextIdx = vnCoords.findIndex(p => p.x === cur.x + dx && p.y === cur.y + dy);
			if (nextIdx !== -1) {
				selectedTarget.index = nextIdx;
				refreshSelectionVisuals();
			}
		}
	}
}

function getStateFromKeyCode(code) {
	let char = null;
	if (code.startsWith('Key')) {
		char = code.slice(3).toUpperCase();
	} else if (code.startsWith('Digit')) {
		char = code.slice(5);
	} else if (/^Numpad[0-9]$/.test(code)) {
		char = code.slice(6);
	}

	if (!char) return null;

	for (let i = 0; i < numStates; i++) {
		if (stateLabels[i].trim().toUpperCase() === char) {
			return i;
		}
	}

	if (/^[0-9]$/.test(char)) {
		const num = parseInt(char, 10);
		if (num < numStates) return num;
	}

	return null;
}

function handleKeyDown(e) {
	if (!selectFirstMode || !selectedTarget) return;

	const activeEl = document.activeElement;
	if (activeEl) {
		const tag = activeEl.tagName;
		if ((tag === 'INPUT' && activeEl.type !== 'checkbox') || tag === 'TEXTAREA' || tag === 'SELECT') {
			return;
		}
	}

	if (e.key === 'ArrowUp') { e.preventDefault(); moveSelection(0, -1); return; }
	if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(0, 1); return; }
	if (e.key === 'ArrowLeft') { e.preventDefault(); moveSelection(-1, 0); return; }
	if (e.key === 'ArrowRight') { e.preventDefault(); moveSelection(1, 0); return; }

	if (e.key === 'Escape') {
		selectedTarget = null;
		refreshSelectionVisuals();
		return;
	}

	if (e.key === 'Backspace' || e.key === 'Delete') {
		e.preventDefault();
		applyStateToSelected(selectedTarget.area === 'rule' ? -1 : 0);
		return;
	}

	const stateVal = getStateFromKeyCode(e.code);
	if (stateVal !== null) {
		e.preventDefault();
		applyStateToSelected(stateVal);
	}
}

function clearHistory(resetSavedGrid = true) {
	historyStack = [];
	if (resetSavedGrid) {
		savedGrid = null;
	}
	updateStepBackButton();
}

function handleCanvasClick(e) {
	const rect = canvas.getBoundingClientRect();
	const x = Math.floor((e.clientX - rect.left) / cellSize);
	const y = Math.floor((e.clientY - rect.top) / cellSize);
	
	if (x >= 0 && x < gridSize && y >= 0 && y < gridSize) {
		if (selectFirstMode) {
			selectedTarget = { area: 'canvas', x, y };
			refreshSelectionVisuals();
			return;
		}
		if (activeTool !== -1 && activeTool < numStates) {
			if (!isRunning) {
				clearHistory();
			}
			grid[y][x] = activeTool;
			draw();
		}
	}
}

function manualStep() {
	if (!savedGrid) savedGrid = grid.map(row => [...row]);
	step();
}

function updateStepBackButton() {
	const btn = document.getElementById('btnStepBack');
	if (btn) {
		btn.disabled = isRunning || historyStack.length === 0;
	}
}

function stepBack() {
	if (isRunning || historyStack.length === 0) return;
	grid = historyStack.pop();
	draw();
	updateStepBackButton();
}

function toggleRun() {
	if (isRunning) {
		clearInterval(intervalId);
		isRunning = false;
	} else {
		if (!savedGrid) savedGrid = grid.map(row => [...row]);
		intervalId = setInterval(step, 650);
		isRunning = true;
	}
	updateStepBackButton();
}

function restartSimulation() {
	if (isRunning) toggleRun();
	if (savedGrid) {
		grid = savedGrid.map(row => [...row]);
		clearHistory(false);
		draw();
	} else {
		alert("No start state saved.");
	}
}

function stopSimulation() {
	if (isRunning) toggleRun();
}

function clearGrid() {
	stopSimulation();
	clearHistory();
	grid = grid.map(row => row.fill(0));
	draw();
}

// function draw() {
// 	ctx.clearRect(0, 0, canvas.width, canvas.height);
// 	ctx.textAlign = 'center';
// 	ctx.textBaseline = 'middle';
// 	ctx.font = 'bold 12px Arial';

// 	for (let y = 0; y < gridSize; y++) {
// 		for (let x = 0; x < gridSize; x++) {
// 			const state = grid[y][x];
// 			const xPos = x * cellSize;
// 			const yPos = y * cellSize;

// 			ctx.fillStyle = stateStyles[state].bg;
// 			ctx.fillRect(xPos, yPos, cellSize, cellSize);
			
// 			ctx.strokeStyle = '#ccc';
// 			ctx.lineWidth = 1;
// 			ctx.strokeRect(xPos, yPos, cellSize, cellSize);
			
// 			if (state !== 0 || stateLabels[0] !== '0') {
// 				ctx.fillStyle = stateStyles[state].text;
// 				ctx.fillText(stateLabels[state], xPos + cellSize/2, yPos + cellSize/2);
// 			}
// 		}
// 	}

// 	if (selectFirstMode && selectedTarget && selectedTarget.area === 'canvas') {
// 		ctx.strokeStyle = '#007bff';
// 		ctx.lineWidth = 3;
// 		ctx.strokeRect(
// 			selectedTarget.x * cellSize + 1.5,
// 			selectedTarget.y * cellSize + 1.5,
// 			cellSize - 3,
// 			cellSize - 3
// 		);
// 	}
// }

function drawGridCells(targetCtx, gridData, size) {
	targetCtx.textAlign = 'center';
	targetCtx.textBaseline = 'middle';
	targetCtx.font = `bold ${Math.max(8, Math.floor(size * 0.55))}px Arial`;

	for (let y = 0; y < gridSize; y++) {
		for (let x = 0; x < gridSize; x++) {
			const state = gridData[y][x];
			const xPos = x * size;
			const yPos = y * size;

			targetCtx.fillStyle = stateStyles[state].bg;
			targetCtx.fillRect(xPos, yPos, size, size);

			targetCtx.strokeStyle = '#ccc';
			targetCtx.lineWidth = 1;
			targetCtx.strokeRect(xPos, yPos, size, size);

			if (state !== 0 || stateLabels[0] !== '0') {
				targetCtx.fillStyle = stateStyles[state].text;
				targetCtx.fillText(stateLabels[state], xPos + size / 2, yPos + size / 2);
			}
		}
	}
}

function draw() {
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	drawGridCells(ctx, grid, cellSize);

	if (selectFirstMode && selectedTarget && selectedTarget.area === 'canvas') {
		ctx.strokeStyle = '#007bff';
		ctx.lineWidth = 3;
		ctx.strokeRect(
			selectedTarget.x * cellSize + 1.5,
			selectedTarget.y * cellSize + 1.5,
			cellSize - 3,
			cellSize - 3
		);
	}
}

// --- Export to PDF ---

function renderGridToDataUrl(gridData) {
	const offscreen = document.createElement('canvas');
	offscreen.width = gridSize * cellSize;
	offscreen.height = gridSize * cellSize;
	const offCtx = offscreen.getContext('2d');
	drawGridCells(offCtx, gridData, cellSize);
	return offscreen.toDataURL('image/png');
}

function createPrintRuleCard(rule, idx) {
	const card = document.createElement('div');
	card.className = 'print-rule-card';

	const title = document.createElement('div');
	title.className = 'print-rule-title';
	title.innerText = `Rule #${idx + 1}`;

	const body = document.createElement('div');
	body.className = 'print-rule-body';

	const miniGrid = document.createElement('div');
	miniGrid.className = 'print-mini-grid';

	for (let i = 0; i < 9; i++) {
		const cell = document.createElement('div');
		cell.className = 'print-mini-cell';

		let stateVal = -2;
		if (rule.type === 'moore') {
			stateVal = rule.pattern[i];
		} else {
			const vnMap = { 1: 0, 3: 1, 4: 2, 5: 3, 7: 4 };
			if (vnMap.hasOwnProperty(i)) {
				stateVal = rule.pattern[vnMap[i]];
			}
		}

		if (stateVal === -2) {
			cell.style.backgroundColor = 'transparent';
		} else if (stateVal === -1) {
			cell.style.backgroundColor = '#eeeeee';
			cell.style.color = '#333333';
			cell.innerText = '?';
		} else {
			if (stateVal >= numStates) stateVal = 0;
			cell.style.backgroundColor = stateStyles[stateVal].bg;
			cell.style.color = stateStyles[stateVal].text;
			cell.innerText = stateLabels[stateVal];
		}
		miniGrid.appendChild(cell);
	}

	const arrow = document.createElement('div');
	arrow.innerHTML = '&rarr;';

	const resBox = document.createElement('div');
	resBox.className = 'print-rule-result';
	resBox.style.backgroundColor = stateStyles[rule.result].bg;
	resBox.style.color = stateStyles[rule.result].text;
	resBox.innerText = stateLabels[rule.result];

	body.appendChild(miniGrid);
	body.appendChild(arrow);
	body.appendChild(resBox);

	card.appendChild(title);
	card.appendChild(body);
	return card;
}

function exportToPdf() {
	stopSimulation();

	const report = document.getElementById('printReport');
	if (!report) return;
	report.innerHTML = '';

	const stepsEl = document.getElementById('exportSteps');
	let stepsCount = stepsEl ? parseInt(stepsEl.value, 10) : 5;
	if (isNaN(stepsCount) || stepsCount < 0) stepsCount = 0;
	if (stepsCount > 100) stepsCount = 100;

	const boundaryEl = document.getElementById('boundary');
	const neighborhoodEl = document.getElementById('neighborhood');
	const boundaryText = boundaryEl.options[boundaryEl.selectedIndex].text;
	const neighborhoodText = neighborhoodEl.options[neighborhoodEl.selectedIndex].text;

	// 1. Header & Settings
	const header = document.createElement('div');
	header.className = 'print-header';
	header.innerHTML = `
		<h1>Cellular Automaton Report</h1>
		<div class="print-meta">
			<span><strong>Grid Size:</strong> ${gridSize} x ${gridSize}</span>
			<span><strong>States:</strong> ${numStates}</span>
			<span><strong>Boundary:</strong> ${boundaryText}</span>
			<span><strong>Neighborhood:</strong> ${neighborhoodText}</span>
		</div>
	`;
	report.appendChild(header);

	// 2. State Legend
	const legendSection = document.createElement('div');
	legendSection.className = 'print-section';
	legendSection.innerHTML = '<h2>States</h2>';
	const legendGrid = document.createElement('div');
	legendGrid.className = 'print-legend';

	for (let i = 0; i < numStates; i++) {
		const item = document.createElement('div');
		item.className = 'print-legend-item';

		const box = document.createElement('div');
		box.className = 'print-legend-box';
		box.style.backgroundColor = stateStyles[i].bg;
		box.style.color = stateStyles[i].text;
		box.innerText = stateLabels[i];

		const label = document.createElement('span');
		label.innerText = `State ${i} ("${stateLabels[i]}")`;

		item.appendChild(box);
		item.appendChild(label);
		legendGrid.appendChild(item);
	}
	legendSection.appendChild(legendGrid);
	report.appendChild(legendSection);

	// 3. Rules
	const rulesSection = document.createElement('div');
	rulesSection.className = 'print-section';
	rulesSection.innerHTML = '<h2>Rules (In Priority Order)</h2>';

	if (rules.length === 0) {
		const emptyNote = document.createElement('p');
		emptyNote.innerText = 'No rules defined. Default: Keep State.';
		rulesSection.appendChild(emptyNote);
	} else {
		const rulesGrid = document.createElement('div');
		rulesGrid.className = 'print-rules-grid';
		rules.forEach((rule, idx) => {
			rulesGrid.appendChild(createPrintRuleCard(rule, idx));
		});
		rulesSection.appendChild(rulesGrid);
	}
	report.appendChild(rulesSection);

	// 4. Simulation Steps (Step 0 to N)
	const stepsSection = document.createElement('div');
	stepsSection.className = 'print-section';
	stepsSection.innerHTML = `<h2>Simulation Steps (0 - ${stepsCount})</h2>`;

	const stepsGrid = document.createElement('div');
	stepsGrid.className = 'print-steps-grid';

	const baseGrid = savedGrid ? savedGrid : grid;
	let simGrid = baseGrid.map(row => [...row]);

	for (let s = 0; s <= stepsCount; s++) {
		const stepCard = document.createElement('div');
		stepCard.className = 'print-step-card';

		const stepTitle = document.createElement('div');
		stepTitle.className = 'print-step-title';
		stepTitle.innerText = `Step ${s}`;

		const img = document.createElement('img');
		img.className = 'print-step-img';
		img.src = renderGridToDataUrl(simGrid);

		stepCard.appendChild(stepTitle);
		stepCard.appendChild(img);
		stepsGrid.appendChild(stepCard);

		if (s < stepsCount) {
			simGrid = computeNextGrid(simGrid);
		}
	}

	stepsSection.appendChild(stepsGrid);
	report.appendChild(stepsSection);

	setTimeout(() => {
		window.print();
	}, 100);
}

document.addEventListener('DOMContentLoaded', () => {
	const el = (id) => document.getElementById(id);

	if (el('btnInit')) el('btnInit').addEventListener('click', initGrid);
	if (el('btnAddRule')) el('btnAddRule').addEventListener('click', addRule);
	if (el('btnStartStop')) el('btnStartStop').addEventListener('click', toggleRun);
	if (el('btnStep')) el('btnStep').addEventListener('click', manualStep);
	if (el('btnStepBack')) el('btnStepBack').addEventListener('click', stepBack);
	if (el('btnRestart')) el('btnRestart').addEventListener('click', restartSimulation);
	if (el('btnClear')) el('btnClear').addEventListener('click', clearGrid);
	if (el('neighborhood')) el('neighborhood').addEventListener('change', updateRuleEditorUI);
	if (el('btnAddState')) el('btnAddState').addEventListener('click', addState);
	if (el('chkSelectFirst')) el('chkSelectFirst').addEventListener('change', toggleSelectFirstMode);
	if (el('btnExportPdf')) el('btnExportPdf').addEventListener('click', exportToPdf);
	
	document.addEventListener('keydown', handleKeyDown);
	
	canvas.addEventListener('mousedown', handleCanvasClick);
	
	initGrid();
});