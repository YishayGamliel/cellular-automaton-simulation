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

// Stores custom symbols for each state ["0", "1", "A", "X"...]
let stateLabels = [];

// Palette (-1 = '?', 0-10 = states)
let activeTool = 1; 

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
	savedGrid = null;
	rules = [];
	editorResult = 0;
	
	renderSymbolEditor(); // Create inputs for symbols
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
	
	if (activeTool === stateVal) btn.classList.add('selected');
	
	btn.addEventListener('click', () => {
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
}

function createEditorCell(index, container, isCenter) {
	const btn = document.createElement('div');
	btn.className = 'cell-btn';
	if (isCenter) btn.style.border = '2px solid red';
	
	// Use current editor value
	renderCellVisuals(btn, editorInputs[index]);

	btn.addEventListener('click', () => {
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
		
		const delBtn = document.createElement('button');
		delBtn.className = 'delete-btn';
		delBtn.innerText = 'X';
		delBtn.addEventListener('click', () => deleteRule(idx));

		item.appendChild(ruleLabel);
		item.appendChild(vizContainer);
		item.appendChild(delBtn);

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

function step() {
	const currentGridSnapshot = grid.map(row => [...row]);
	const nextGrid = Array(gridSize).fill().map(() => Array(gridSize).fill(0));
	const type = document.getElementById('neighborhood').value;

	for (let y = 0; y < gridSize; y++) {
		for (let x = 0; x < gridSize; x++) {
			const neighbors = getNeighbors(currentGridSnapshot, x, y, type);
			let matchFound = false;
			for (let rule of rules) {
				if(rule.type !== type) continue; 
				if (checkMatch(rule.pattern, neighbors)) {
					nextGrid[y][x] = rule.result;
					matchFound = true;
					break;
				}
			}
			if (!matchFound) {
				nextGrid[y][x] = currentGridSnapshot[y][x];
			}
		}
	}
	grid = nextGrid;
	draw();
}

// --- Interaction ---

function handleCanvasClick(e) {
	const rect = canvas.getBoundingClientRect();
	const x = Math.floor((e.clientX - rect.left) / cellSize);
	const y = Math.floor((e.clientY - rect.top) / cellSize);
	
	if (x >= 0 && x < gridSize && y >= 0 && y < gridSize) {
		if (activeTool !== -1 && activeTool < numStates) {
			if (!isRunning)	savedGrid = null; 
			grid[y][x] = activeTool;
			draw();
		}
	}
}

function manualStep() {
	if (!savedGrid) savedGrid = grid.map(row => [...row]);
	step();
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
}

function restartSimulation() {
	if (isRunning) toggleRun();
	if (savedGrid) {
		grid = savedGrid.map(row => [...row]);
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
	savedGrid = null;
	grid = grid.map(row => row.fill(0));
	draw();
}

function draw() {
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.font = 'bold 12px Arial';

	for (let y = 0; y < gridSize; y++) {
		for (let x = 0; x < gridSize; x++) {
			const state = grid[y][x];
			const xPos = x * cellSize;
			const yPos = y * cellSize;

			ctx.fillStyle = stateStyles[state].bg;
			ctx.fillRect(xPos, yPos, cellSize, cellSize);
			
			ctx.strokeStyle = '#ccc';
			ctx.lineWidth = 1;
			ctx.strokeRect(xPos, yPos, cellSize, cellSize);
			
			if (state !== 0 || stateLabels[0] !== '0') {
				ctx.fillStyle = stateStyles[state].text;
				ctx.fillText(stateLabels[state], xPos + cellSize/2, yPos + cellSize/2);
			}
		}
	}
}

document.addEventListener('DOMContentLoaded', () => {
	const el = (id) => document.getElementById(id);

	if (el('btnInit')) el('btnInit').addEventListener('click', initGrid);
	if (el('btnAddRule')) el('btnAddRule').addEventListener('click', addRule);
	if (el('btnStartStop')) el('btnStartStop').addEventListener('click', toggleRun);
	if (el('btnStep')) el('btnStep').addEventListener('click', manualStep);
	if (el('btnRestart')) el('btnRestart').addEventListener('click', restartSimulation);
	if (el('btnClear')) el('btnClear').addEventListener('click', clearGrid);
	if (el('neighborhood')) el('neighborhood').addEventListener('change', updateRuleEditorUI);
	
	canvas.addEventListener('mousedown', handleCanvasClick);
	
	initGrid();
});