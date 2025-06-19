document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements (Ensure IDs match line_coding_visualizer_v3 HTML) ---
    const dataInput = document.getElementById('dataInput');
    const inputTypeRadios = document.querySelectorAll('input[name="inputType"]');
    const techniqueSelect = document.getElementById('technique');
    const transmissionTypeRadios = document.querySelectorAll('input[name="transmissionType"]');
    const startBtn = document.getElementById('startAnimationBtn');
    const controlsSection = document.getElementById('controlsSection');
    const speedControl = document.getElementById('speedControl');
    const speedValue = document.getElementById('speedValue');
    const pauseResumeBtn = document.getElementById('pauseResumeBtn');
    const resetBtn = document.getElementById('resetBtn');
    const injectErrorBtn = document.getElementById('injectErrorBtn');
    const inputError = document.getElementById('inputError');
    const visualizationSection = document.getElementById('visualizationSection');
    const statusDisplay = document.getElementById('statusDisplay');
    const originalInputEl = document.getElementById('originalInput');
    const binaryInputAnimatedEl = document.getElementById('binaryInputAnimated');
    const stuffingTypeEl = document.getElementById('stuffingType');
    const stuffedDataEl = document.getElementById('stuffedData');
    const stuffedBitCountEl = document.getElementById('stuffedBitCount');
    const encodingBitEl = document.getElementById('encodingBit');
    const encoderBox = document.getElementById('encoderBox'); // The span containing ENCODER text
    const encodingTypeShortEl = document.getElementById('encodingTypeShort');
    const currentSignalLevelEl = document.getElementById('currentSignalLevel');
    const encoderStateEl = document.getElementById('encoderState');
    const transmissionMediumLabel = document.getElementById('transmissionMediumLabel');
    const encodingTypeEl = document.getElementById('encodingType');
    const signalCanvas = document.getElementById('signalCanvas');
    const decoderBox = document.getElementById('decoderBox'); // The span containing DECODER text
    const decodedBitEl = document.getElementById('decodedBit');
    const decodedBinaryAnimatedEl = document.getElementById('decodedBinaryAnimated');
    const destuffingTypeLabel = document.getElementById('destuffingTypeLabel');
    const destuffedDataEl = document.getElementById('destuffedData');
    const destuffedBitCountEl = document.getElementById('destuffedBitCount');
    const finalMessageEl = document.getElementById('finalMessage');
    const bitDropArea = document.getElementById('bitDropArea');
    const ctx = signalCanvas.getContext('2d');

    // --- State Variables ---
    let animationIntervalId = null;
    let animationSpeed = 500;
    let isPaused = false;
    let currentStep = 0;
    let totalSteps = 0;
    let originalMessage = '';
    let binaryData = '';
    let stuffedData = ''; // Data after stuffing
    let stuffedIndices = []; // Track indices where stuffing occurred
    let processedData = ''; // Data actually used for encoding (stuffed or original)
    let technique = '';
    let encodingName = '';
    let transmissionType = 'wired';
    let signalDataPoints = []; // Array of { time: t, level: l } points
    let decodedBits = []; // Array of decoded bits ('0', '1', or '?')
    let bitErrors = []; // Track indices (relative to processedData) of injected errors
    let destuffedBits = ''; // Final data after destuffing
    let finalMessage = ''; // Final human-readable message or bitstream
    let needsStuffing = false;
    let isBitStuffing = false;
    let requiresNRZLVisualization = false; // Flag if stuffing uses NRZ-L internally
    let encodingFn, decodingFn, stuffingFn, destuffingFn;
    let previousLevelNRZI = -1; // Start low for NRZI state
    let levelBeforeIntervalDiffMan = -1; // Start low for Diff Man state
    let injectErrorNext = false; // Flag for error injection on the next step

    const FLAG = '01111110'; // Standard HDLC Flag
    const ESC = '01111101'; // Standard HDLC Escape

    // --- Canvas Constants ---
    const V_PADDING = 30;
    const H_PADDING = 20;
    const MID_Y = signalCanvas.height / 2;
    const HIGH_Y = V_PADDING;
    const LOW_Y = signalCanvas.height - V_PADDING;
    const SIGNAL_AMPLITUDE = MID_Y - HIGH_Y;

    // --- Colors (Tailwind Defaults for Consistency) ---
    const COLOR_ZERO_BIT = '#3b82f6'; // blue-500
    const COLOR_ONE_BIT = '#ef4444';  // red-500
    const COLOR_TRANSITION = '#6b7280'; // gray-500
    const COLOR_BIT_BOUNDARY = '#f59e0b'; // amber-500
    const COLOR_ERROR = '#e11d48'; // rose-600
    const COLOR_GRID = '#e5e7eb'; // gray-200
    const COLOR_TEXT = '#4b5563'; // gray-600
    const COLOR_STUFFED_BIT_ANIM = '#f59e0b'; // amber-500 (for animation)
    const COLOR_AXIS = '#333333';

    // --- Event Listeners ---
    startBtn.addEventListener('click', startAnimation);
    resetBtn.addEventListener('click', resetAnimation);
    pauseResumeBtn.addEventListener('click', togglePauseResume);
    injectErrorBtn.addEventListener('click', () => {
        if (animationIntervalId && !isPaused) {
            injectErrorNext = true;
            setStatus('<i class="bi bi-exclamation-diamond-fill me-1"></i>Error injection armed for next bit!', 'warning');
             // Add visual feedback using Tailwind classes if desired
             injectErrorBtn.classList.add('ring-2', 'ring-red-500');
        }
    });
    speedControl.addEventListener('input', updateSpeed);
    // Add listeners for transmission type change to update label immediately
    transmissionTypeRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            transmissionMediumLabel.textContent = radio.value.charAt(0).toUpperCase() + radio.value.slice(1);
        });
    });
     // Add listener for input validation
     dataInput.addEventListener('input', validateInput);
     inputTypeRadios.forEach(radio => radio.addEventListener('change', validateInput));


    // --- Initialization ---
    updateSpeedValue(speedControl.value);
    resetAnimation(); // Initialize UI state correctly

    // --- Input Validation ---
     function validateInput() {
        const data = dataInput.value;
        const forceBitstream = document.querySelector('input[name="inputType"]:checked').value === 'bitstream';
        const isOnlyZerosAndOnes = /^[01\s]*$/.test(data);

        if (forceBitstream && data.trim() !== '' && !/^[01]+$/.test(data.replace(/\s/g, ''))) {
            inputError.textContent = "Invalid bitstream. Use only 0s and 1s.";
            inputError.classList.remove('d-none');
            startBtn.disabled = true;
        } else {
            inputError.classList.add('d-none');
            startBtn.disabled = data.trim() === ''; // Disable if empty
        }
    }

    // --- Core Animation Functions ---

    function startAnimation() {
        resetAnimation(); // Clear previous state but keep input
        isPaused = false;
        updatePauseResumeButton();

        setStatus('<i class="bi bi-hourglass-split me-1"></i>Validating input...', 'info');
        if (!getInputData()) { // Validates and sets binaryData
            startBtn.disabled = false; // Re-enable start if input fails
            return;
        }

        technique = techniqueSelect.value;
        transmissionType = document.querySelector('input[name="transmissionType"]:checked').value;

        setStatus('<i class="bi bi-gear me-1"></i>Preparing data and applying stuffing...', 'info');
        prepareData(); // Sets processedData, stuffingFn, encodingFn etc.

        if (!processedData && needsStuffing) { // Check if stuffing failed or resulted in empty
             setStatus('<i class="bi bi-x-octagon-fill me-1"></i>Error: Could not process data (stuffing might have failed).', 'error');
             startBtn.disabled = false;
             return;
        }
        if (!processedData && !needsStuffing && binaryData) { // If no stuffing, use binaryData
            processedData = binaryData;
        }
        if (!processedData) { // Final check if still no data
            setStatus('<i class="bi bi-x-octagon-fill me-1"></i>Error: No data to process.', 'error');
            startBtn.disabled = false;
            return;
        }


        setupVisualizationUI(); // Populate displays with initial data

        totalSteps = processedData.length;
        currentStep = 0;
        signalDataPoints = []; // Reset signal points
        decodedBits = []; // Reset decoded bits array
        bitErrors = []; // Reset errors
        injectErrorNext = false; // Reset error flag
        previousLevelNRZI = -1; // Reset state variables
        levelBeforeIntervalDiffMan = -1;

        if (totalSteps === 0) {
            setStatus('<i class="bi bi-info-circle-fill me-1"></i>No data bits to process.', 'warning');
            completeAnimation(); // Go directly to completion if no data
            return;
        }

        setStatus(`<i class="bi bi-play-circle-fill me-1"></i>Starting: Encoding bit 1 of ${totalSteps}...`, 'active');
        visualizationSection.classList.remove('d-none');
        controlsSection.classList.remove('d-none');
        startBtn.disabled = true;
        resetBtn.disabled = false;
        pauseResumeBtn.disabled = false;
        injectErrorBtn.disabled = false;


        animationIntervalId = setInterval(animationStep, animationSpeed);
    }

    async function animationStep() {
        if (isPaused || currentStep >= totalSteps) {
            if (currentStep >= totalSteps) {
                completeAnimation();
            }
            return;
        }

        const bitIndex = currentStep; // Index in the *processed* data
        const currentBit = processedData[bitIndex];

        // Find corresponding original binary bit index
        const originalBitIndex = findOriginalBitIndex(bitIndex);

        // --- Phase 0: Animate Bit Drop ---
        setStatus(`<i class="bi bi-arrow-down-circle me-1"></i>Processing bit ${bitIndex + 1} ('${currentBit}')...`, "active");
        if (originalBitIndex !== -1) {
            // Animate the bit drop from the *original* binary display
            await animateBitDrop(originalBitIndex, currentBit, stuffedIndices.includes(bitIndex));
        } else if (stuffedIndices.includes(bitIndex)) {
             // Optionally animate stuffed bits differently (e.g., from stuffed display)
             // For now, we skip animation if original index is -1
        }

        // Highlight source bit(s)
        highlightBinarySpan(binaryInputAnimatedEl, originalBitIndex, 'highlight-current'); // Highlight original source
        if (needsStuffing) {
            // Highlight the bit in the stuffed data display
            highlightBinarySpan(stuffedDataEl, bitIndex, stuffedIndices.includes(bitIndex) ? 'highlight-stuffed' : 'highlight-current', false, true); // Highlight stuffed bit, don't clear others yet
        }
        encodingBitEl.textContent = currentBit;
        // Update badge color based on bit value
        encodingBitEl.className = `badge ms-1 bit-display-badge align-middle ${currentBit === '0' ? 'bg-blue-500 text-white' : 'bg-red-500 text-white'}`;


        // --- Phase 1: Encoding ---
        const newSignalPoints = calculateEncodingForBit(currentBit, bitIndex);
        const currentLevelText = getCurrentLevelText(newSignalPoints);
        currentSignalLevelEl.textContent = currentLevelText;
        updateEncoderDecoderState('encoder'); // Update state display

        // Delay slightly after encoding logic shown, before drawing
        await delay(animationSpeed * 0.1);

        signalDataPoints.push(...newSignalPoints); // Add new points to the total signal

        // --- Phase 2: Transmission Visualization ---
        setStatus(`<i class="bi bi-reception-4 me-1"></i>Transmitting signal for bit ${bitIndex + 1}...`, "active");
        // Draw the signal up to the current point
        drawSignal(processedData, signalDataPoints, technique, bitIndex + 1, bitErrors);

        // --- Phase 3: Potential Error Injection ---
        let actualDecodedBit;
        let bitHadError = false;
        if (injectErrorNext) {
            bitHadError = true;
            bitErrors.push(bitIndex); // Record error index (relative to processedData)
            actualDecodedBit = currentBit === '0' ? '1' : '0'; // Flip the bit for decoding simulation
            setStatus(`<i class="bi bi-radioactive me-1"></i>Bit ${bitIndex + 1} flipped during transmission!`, 'error');
            injectErrorNext = false; // Reset flag
            injectErrorBtn.classList.remove('ring-2', 'ring-red-500'); // Deactivate button visual

            // Redraw signal immediately to show error marker on the timeline
            drawSignal(processedData, signalDataPoints, technique, bitIndex + 1, bitErrors);
            await delay(animationSpeed * 0.3); // Pause longer on error
        } else {
            // --- Phase 4: Normal Decoding ---
            setStatus(`<i class="bi bi-cpu me-1"></i>Decoding signal for bit ${bitIndex + 1}...`, "active");
            // Decode using the *latest* points added for this bit
            actualDecodedBit = calculateDecodingForBit(newSignalPoints, bitIndex);

            // Check for decoding mismatch (e.g., invalid Manchester transition detected by decoder)
            if (actualDecodedBit === '?') {
                setStatus(`<i class="bi bi-exclamation-triangle-fill me-1"></i>Decoding error for bit ${bitIndex + 1}! Invalid signal pattern.`, 'warning');
                bitHadError = true; // Treat as error
                bitErrors.push(bitIndex); // Mark error for visualization
                drawSignal(processedData, signalDataPoints, technique, bitIndex + 1, bitErrors); // Redraw with error marker
            } else if (actualDecodedBit !== currentBit && !bitHadError) {
                // This indicates a potential logic bug if no error was injected
                console.warn(`Potential Logic Error: Encoded '${currentBit}', Decoded '${actualDecodedBit}' for bit ${bitIndex}`);
                // Optionally flag this differently
            }
        }

        // Update Decoder UI
        decodedBits.push(actualDecodedBit); // Add the decoded bit (potentially flipped or '?')
        decodedBitEl.textContent = actualDecodedBit;
        // Update badge color based on decoded value
        let decodedBadgeClass = 'bg-gray-500 text-white'; // Default for '?'
        if (actualDecodedBit === '0') decodedBadgeClass = 'bg-success text-white';
        else if (actualDecodedBit === '1') decodedBadgeClass = 'bg-warning text-dark'; // Or maybe red?
        if (bitHadError) decodedBadgeClass = 'bg-danger text-white'; // Error color overrides
        decodedBitEl.className = `badge ms-1 bit-display-badge align-middle ${decodedBadgeClass}`;

        // Append and highlight the decoded bit
        highlightBinarySpan(decodedBinaryAnimatedEl, bitIndex, bitHadError ? 'highlight-error' : 'highlight-decoded', true);


        // --- Cleanup for next step ---
        // Mark source bit as processed (use original index)
        highlightBinarySpan(binaryInputAnimatedEl, originalBitIndex, 'highlight-processed');
        if (needsStuffing) {
            // Mark stuffed bit as processed
            highlightBinarySpan(stuffedDataEl, bitIndex, stuffedIndices.includes(bitIndex) ? 'highlight-stuffed' : 'highlight-processed', false, true);
        }

        await delay(animationSpeed * 0.1); // Brief pause after decoding shown
        encodingBitEl.textContent = '--';
        encodingBitEl.className = 'badge bg-primary text-white ms-1 bit-display-badge align-middle'; // Reset color
        decodedBitEl.textContent = '--';
        decodedBitEl.className = 'badge bg-secondary text-white ms-1 bit-display-badge align-middle'; // Reset color
        currentSignalLevelEl.textContent = 'N/A';


        currentStep++;

        if (currentStep >= totalSteps) {
            completeAnimation();
        } else {
            setStatus(`<i class="bi bi-arrow-right-circle me-1"></i>Ready for bit ${currentStep + 1}...`, "info");
        }
    }

    function completeAnimation() {
        clearInterval(animationIntervalId);
        animationIntervalId = null;
        setStatus(`<i class="bi bi-check-circle-fill me-1"></i>Animation Complete! ${totalSteps} bits processed. ${bitErrors.length} error(s) encountered.`, bitErrors.length > 0 ? "warning" : "success");
        pauseResumeBtn.disabled = true;
        injectErrorBtn.disabled = true;
        injectErrorBtn.classList.remove('ring-2', 'ring-red-500');


        // Final Destuffing
        destuffedBits = '';
        let destuffError = false;
        if (needsStuffing) {
            try {
                destuffedBits = destuffingFn(decodedBits.join('')); // Use the collected decoded bits
                destuffedDataEl.innerHTML = `<span>${formatBinaryString(destuffedBits)}</span>`; // Display formatted destuffed data
                destuffingTypeLabel.textContent = isBitStuffing ? 'Bit Destuffing' : 'Byte Stuffing';
                // Calculate removed bits/bytes based on difference
                const removedCount = processedData.length - destuffedBits.length; // Compare stuffed length to destuffed length
                 // Provide more context for byte stuffing count
                 if (!isBitStuffing) {
                    const escBytesRemoved = (processedData.split(ESC).length - 1) - (destuffedBits.split(ESC).length - 1); // Approx ESC count diff
                    const flagsRemoved = 2; // Assume start/end flags removed
                    destuffedBitCountEl.textContent = `${escBytesRemoved} ESC, ${flagsRemoved} Flags removed`;
                 } else {
                    destuffedBitCountEl.textContent = `${removedCount} bits removed`;
                 }
                destuffedBitCountEl.classList.toggle('text-red-600', removedCount === 0 && stuffedIndices.length > 0); // Show error if stuffing happened but nothing removed
            } catch (e) {
                console.error("Destuffing error:", e);
                destuffedDataEl.textContent = "Error during destuffing.";
                destuffingTypeLabel.textContent = "Error";
                destuffedBitCountEl.textContent = '';
                destuffError = true;
            }
        } else {
            destuffedBits = decodedBits.join(''); // No destuffing needed
            destuffedDataEl.textContent = 'N/A';
            destuffingTypeLabel.textContent = 'N/A';
            destuffedBitCountEl.textContent = '';
        }

        // Final Message Conversion
        const finalBinaryToConvert = destuffedBits;
        const finalOutputBox = finalMessageEl.closest('div'); // Get the container div

        if (destuffError || finalBinaryToConvert.length === 0) {
            finalMessageEl.textContent = "(No valid output due to errors or empty data)";
            // Style the container as error
             if(finalOutputBox) {
                finalOutputBox.classList.remove('bg-emerald-50', 'border-emerald-200');
                finalOutputBox.classList.add('bg-red-50', 'border-red-200');
                finalOutputBox.querySelector('strong').classList.remove('text-emerald-800');
                finalOutputBox.querySelector('strong').classList.add('text-red-800');
             }
        } else {
            try {
                // Determine if original input was likely text
                const wasOriginallyText = (!/^[01\s]+$/.test(originalMessage) || document.querySelector('input[name="inputType"]:checked').value === 'auto' && !/^[01\s]+$/.test(originalMessage));

                if (wasOriginallyText && finalBinaryToConvert.length >= 8 && finalBinaryToConvert.length % 8 === 0) {
                    finalMessage = binaryToText(finalBinaryToConvert);
                    finalMessageEl.textContent = finalMessage;
                } else {
                     // If input was bitstream or conversion to text isn't appropriate, show binary
                    finalMessage = formatBinaryString(finalBinaryToConvert); // Store formatted binary
                    finalMessageEl.textContent = finalMessage;
                }

                 // Reset container style to success first
                 if(finalOutputBox) {
                    finalOutputBox.classList.remove('bg-red-50', 'border-red-200');
                    finalOutputBox.classList.add('bg-emerald-50', 'border-emerald-200');
                    finalOutputBox.querySelector('strong').classList.remove('text-red-800');
                    finalOutputBox.querySelector('strong').classList.add('text-emerald-800');
                 }

                 // Check for mismatches if input was bitstream and no errors/stuffing issues occurred
                 if (/^[01\s]+$/.test(originalMessage) && !needsStuffing && !destuffError && bitErrors.length === 0) {
                    const originalCleaned = originalMessage.replace(/\s/g, '');
                     if (originalCleaned === finalBinaryToConvert) {
                         // Matches - style remains success
                         finalMessageEl.textContent += "\n(Matches original bitstream)";
                     } else {
                         // Mismatch - style as error
                         if(finalOutputBox) {
                            finalOutputBox.classList.remove('bg-emerald-50', 'border-emerald-200');
                            finalOutputBox.classList.add('bg-red-50', 'border-red-200');
                            finalOutputBox.querySelector('strong').classList.remove('text-emerald-800');
                            finalOutputBox.querySelector('strong').classList.add('text-red-800');
                         }
                         finalMessageEl.textContent += "\n(Mismatch with original bitstream!)";
                     }
                 } else if (bitErrors.length > 0 || destuffError) {
                     // If there were errors, style as error regardless of input type
                     if(finalOutputBox) {
                        finalOutputBox.classList.remove('bg-emerald-50', 'border-emerald-200');
                        finalOutputBox.classList.add('bg-red-50', 'border-red-200');
                        finalOutputBox.querySelector('strong').classList.remove('text-emerald-800');
                        finalOutputBox.querySelector('strong').classList.add('text-red-800');
                     }
                 }


            } catch (e) {
                finalMessageEl.textContent = "Error decoding final binary.";
                console.error("Final decode error:", e);
                 if(finalOutputBox) { // Style as error on decode failure
                    finalOutputBox.classList.remove('bg-emerald-50', 'border-emerald-200');
                    finalOutputBox.classList.add('bg-red-50', 'border-red-200');
                    finalOutputBox.querySelector('strong').classList.remove('text-emerald-800');
                    finalOutputBox.querySelector('strong').classList.add('text-red-800');
                 }
            }
        }
    } // End completeAnimation

    function resetAnimation() {
        clearInterval(animationIntervalId);
        animationIntervalId = null;
        isPaused = true; // Start in a paused-like state

        currentStep = 0; totalSteps = 0;
        originalMessage = ''; binaryData = ''; stuffedData = ''; stuffedIndices = []; processedData = '';
        signalDataPoints = []; decodedBits = []; bitErrors = []; destuffedBits = ''; finalMessage = '';
        needsStuffing = false; isBitStuffing = false; requiresNRZLVisualization = false;
        previousLevelNRZI = -1; levelBeforeIntervalDiffMan = -1; injectErrorNext = false;

        // Clear UI Elements
        visualizationSection.classList.add('d-none');
        controlsSection.classList.add('d-none');
        inputError.classList.add('d-none');
        inputError.textContent = ''; // Clear error text
        setStatus('<i class="bi bi-info-circle-fill me-1"></i>Enter data and press Start.', 'info');
        originalInputEl.textContent = '';
        binaryInputAnimatedEl.textContent = ''; // Use textContent for pre
        stuffedDataEl.textContent = ''; // Use textContent for pre
        stuffedBitCountEl.textContent = '';
        encodingBitEl.textContent = '--';
        encodingBitEl.className = 'badge bg-primary text-white ms-1 bit-display-badge align-middle'; // Reset class
        decodedBitEl.textContent = '--';
        decodedBitEl.className = 'badge bg-secondary text-white ms-1 bit-display-badge align-middle'; // Reset class
        decodedBinaryAnimatedEl.textContent = ''; // Use textContent for pre
        destuffedDataEl.textContent = ''; // Use textContent for pre
        destuffedBitCountEl.textContent = '';
        finalMessageEl.textContent = '';
        stuffingTypeEl.textContent = 'N/A';
        destuffingTypeLabel.textContent = 'N/A';
        encodingTypeShortEl.textContent = 'N/A';
        currentSignalLevelEl.textContent = 'N/A';
        encoderStateEl.textContent = 'N/A';
        bitDropArea.innerHTML = ''; // Clear bit animations

        // Reset final message box styling
        const finalOutputBox = finalMessageEl.closest('div');
         if(finalOutputBox) {
            finalOutputBox.classList.remove('bg-red-50', 'border-red-200');
            finalOutputBox.classList.add('bg-emerald-50', 'border-emerald-200');
            finalOutputBox.querySelector('strong').classList.remove('text-red-800');
            finalOutputBox.querySelector('strong').classList.add('text-emerald-800');
         }


        ctx.clearRect(0, 0, signalCanvas.width, signalCanvas.height);

        // Reset Buttons
        updatePauseResumeButton(); // Set button text correctly
        pauseResumeBtn.disabled = true;
        resetBtn.disabled = true;
        injectErrorBtn.disabled = true;
        injectErrorBtn.classList.remove('ring-2', 'ring-red-500');
        startBtn.disabled = dataInput.value.trim() === ''; // Disable start only if input is empty

        validateInput(); // Re-run validation
    }

    function togglePauseResume() {
        if (!animationIntervalId && currentStep >= totalSteps) return; // Animation finished

        isPaused = !isPaused;
        updatePauseResumeButton();

        if (isPaused) {
            clearInterval(animationIntervalId);
            animationIntervalId = null;
            setStatus(`<i class="bi bi-pause-circle-fill me-1"></i>Paused at bit ${currentStep + 1}.`, "warning");
        } else {
            setStatus(`<i class="bi bi-play-circle-fill me-1"></i>Resumed. Processing bit ${currentStep + 1}...`, "info");
            animationIntervalId = setInterval(animationStep, animationSpeed);
        }
    }

    function updatePauseResumeButton() {
        if (isPaused) {
            pauseResumeBtn.innerHTML = '<i class="bi bi-play-fill me-1"></i>Resume';
            pauseResumeBtn.classList.remove('btn-warning');
            pauseResumeBtn.classList.add('btn-success');
        } else {
            pauseResumeBtn.innerHTML = '<i class="bi bi-pause-fill me-1"></i>Pause';
            pauseResumeBtn.classList.remove('btn-success');
            pauseResumeBtn.classList.add('btn-warning');
        }
    }

    function updateSpeed() {
        animationSpeed = parseInt(speedControl.value, 10);
        updateSpeedValue(animationSpeed);
        if (animationIntervalId && !isPaused) {
            clearInterval(animationIntervalId);
            animationIntervalId = setInterval(animationStep, animationSpeed);
        }
    }

    function updateSpeedValue(value) {
        speedValue.textContent = `(${value}ms)`;
    }

    // Updated setStatus to use Tailwind/Bootstrap classes from the HTML
    function setStatus(message, type = "info") {
        statusDisplay.innerHTML = message; // Allow icons

        // Define base classes and type-specific classes
        const baseClasses = "text-sm font-medium px-3 py-1.5 rounded-md flex-grow text-center border";
        let typeClasses = "bg-blue-100 text-blue-800 border-blue-200"; // Default info

        switch (type) {
            case 'success':
                typeClasses = "bg-green-100 text-green-800 border-green-200";
                break;
            case 'warning':
                typeClasses = "bg-yellow-100 text-yellow-800 border-yellow-200";
                break;
            case 'error':
                typeClasses = "bg-red-100 text-red-800 border-red-200";
                break;
            case 'active': // Use a distinct style for active processing
                typeClasses = "bg-indigo-100 text-indigo-800 border-indigo-200";
                break;
        }
        statusDisplay.className = `${baseClasses} ${typeClasses}`;
    }

    function updateEncoderDecoderState(stage, tech = technique, nrziState = previousLevelNRZI, diffManState = levelBeforeIntervalDiffMan) {
        let stateText = 'N/A';
        if (stage === 'encoder') {
            if (tech === 'nrzi') {
                // Use the state *before* the current bit determined the level
                 const levelBeforeCurrentBit = signalDataPoints.length > 0 ? signalDataPoints[signalDataPoints.length - 1 - (newSignalPoints ? newSignalPoints.length : 0)].level : previousLevelNRZI;
                stateText = `Prev Level: ${levelBeforeCurrentBit === 1 ? '+V' : '-V'}`;
            } else if (tech === 'diffmanchester') {
                // Use the state *before* the current bit started
                 const levelBeforeCurrentBit = signalDataPoints.length > 1 ? signalDataPoints[signalDataPoints.length - 2 - (newSignalPoints ? newSignalPoints.length : 0)].level : levelBeforeIntervalDiffMan;
                stateText = `Level Before: ${levelBeforeCurrentBit === 1 ? '+V' : '-V'}`;
            }
            encoderStateEl.textContent = stateText;
        }
        // Decoder state display is less common, can be added if needed
    }

    function getCurrentLevelText(points) {
        if (!points || points.length === 0) return 'N/A';
        // Format points array for display
        return points.map(p => p.level === 1 ? '+V' : (p.level === -1 ? '-V' : '0V')).join(' -> ');
    }


    // --- Data Preparation and Setup ---

    function getInputData() {
        const rawData = dataInput.value.trim();
        const selectedInputType = document.querySelector('input[name="inputType"]:checked').value;
        originalMessage = rawData; // Store the raw input

        if (rawData === '') {
            setStatus('<i class="bi bi-exclamation-triangle-fill me-1"></i>Error: Input data cannot be empty.', "error");
            inputError.textContent = "Input data cannot be empty.";
            inputError.classList.remove('d-none');
            return false;
        }

        inputError.classList.add('d-none'); // Assume valid until proven otherwise

        if (selectedInputType === 'bitstream') {
             const cleanedData = rawData.replace(/\s/g, ''); // Remove spaces for validation
            if (!/^[01]+$/.test(cleanedData) || cleanedData.length === 0) {
                setStatus('<i class="bi bi-exclamation-triangle-fill me-1"></i>Error: Invalid bitstream input. Use only 0s and 1s.', "error");
                inputError.textContent = "Invalid bitstream. Use only 0s and 1s.";
                inputError.classList.remove('d-none');
                return false;
            }
            binaryData = cleanedData;
        } else { // Auto-detect
            const cleanedData = rawData.replace(/\s/g, '');
            if (/^[01]+$/.test(cleanedData) && cleanedData.length > 0) {
                // Looks like a bitstream
                binaryData = cleanedData;
                // Keep originalMessage as the raw input which might have spaces
            } else {
                // Treat as text
                binaryData = textToBinary(rawData);
            }
        }

        if (!binaryData) { // Should not happen if input wasn't empty, but check anyway
            setStatus('<i class="bi bi-x-octagon-fill me-1"></i>Error: Could not convert input to binary data.', "error");
            return false;
        }
        return true;
    }

    function prepareData() {
        needsStuffing = false; requiresNRZLVisualization = false; isBitStuffing = false;
        stuffedData = ''; stuffedIndices = [];
        processedData = binaryData; // Default to original binary

        encodingName = techniqueSelect.options[techniqueSelect.selectedIndex].text;
        let shortEncodingName = technique.toUpperCase();

        switch (technique) {
            case 'nrzl': encodingFn = encodeNRZLBit; decodingFn = decodeNRZLSignal; shortEncodingName = "NRZ-L"; break;
            case 'nrzi': encodingFn = encodeNRZIBit; decodingFn = decodeNRZISignal; shortEncodingName = "NRZ-I"; break;
            case 'manchester': encodingFn = encodeManchesterBit; decodingFn = decodeManchesterSignal; shortEncodingName = "MANCH"; break;
            case 'diffmanchester': encodingFn = encodeDiffManchesterBit; decodingFn = decodeDiffManchesterSignal; shortEncodingName = "DIFF"; break;
            case 'bitstuff':
                needsStuffing = true; isBitStuffing = true; requiresNRZLVisualization = true;
                stuffingFn = bitStuffDetailed;
                destuffingFn = bitDestuff; // Standard destuffing
                let bitStuffResult = stuffingFn(binaryData);
                stuffedData = bitStuffResult.stuffed;
                stuffedIndices = bitStuffResult.stuffedIndices;
                processedData = stuffedData; // Use stuffed data for processing
                encodingFn = encodeNRZLBit; decodingFn = decodeNRZLSignal; // Use NRZ-L
                encodingName = `Bit Stuffing (NRZ-L)`; shortEncodingName = "BIT+NRZL";
                break;
            case 'bytestuff':
                needsStuffing = true; isBitStuffing = false; requiresNRZLVisualization = true;
                stuffingFn = (d) => byteStuffDetailed(d, FLAG, ESC);
                destuffingFn = (d) => byteDestuff(d, FLAG, ESC);
                let byteStuffResult = stuffingFn(binaryData);
                stuffedData = byteStuffResult.stuffed;
                stuffedIndices = byteStuffResult.stuffedIndices; // Indices of ESC bytes
                processedData = stuffedData; // Use stuffed data for processing
                encodingFn = encodeNRZLBit; decodingFn = decodeNRZLSignal; // Use NRZ-L
                encodingName = `Byte Stuffing (NRZ-L)`; shortEncodingName = "BYTE+NRZL";
                break;
            default:
                setStatus('<i class="bi bi-x-octagon-fill me-1"></i>Error: Unknown technique selected.', "error");
                processedData = ''; return;
        }
        encodingTypeShortEl.textContent = shortEncodingName;
    }

    function setupVisualizationUI() {
        // Display original message/bitstream
        originalInputEl.textContent = originalMessage.length > 100 ? originalMessage.substring(0, 97) + '...' : originalMessage;

        // Display binary data with spans for highlighting
        binaryInputAnimatedEl.innerHTML = binaryData.split('').map((bit, index) => `<span id="bin-in-${index}">${bit}</span>`).join('');

        // Clear previous outputs
        decodedBinaryAnimatedEl.innerHTML = '';
        destuffedDataEl.textContent = 'N/A';
        finalMessageEl.textContent = '';
        destuffingTypeLabel.textContent = 'N/A';
        destuffedBitCountEl.textContent = '';


        // Display stuffed data if applicable
        if (needsStuffing) {
            let stuffedHtml = '';
            for (let i = 0; i < processedData.length; i++) {
                const isStuffed = stuffedIndices.includes(i);
                const bit = processedData[i];
                const isStartOfByte = i % 8 === 0;
                 // Add space between bytes for byte stuffing, except at the start
                if (isStartOfByte && !isBitStuffing && i !== 0) stuffedHtml += ' ';

                // Add span with ID and highlight class if stuffed
                stuffedHtml += `<span id="stuff-in-${i}" class="${isStuffed ? 'highlight-stuffed text-amber-600 font-bold' : ''}">${bit}</span>`;
            }
            stuffedDataEl.innerHTML = stuffedHtml; // Use innerHTML
            stuffingTypeEl.textContent = isBitStuffing ? 'Bit Stuffing' : 'Byte Stuffing';
            // Calculate stuffed count based on length difference or indices count
             const addedCount = isBitStuffing ? stuffedIndices.length : stuffedIndices.length / 8; // Approx for bytes
             const countLabel = isBitStuffing ? 'bits added' : 'ESC bytes added';
            stuffedBitCountEl.textContent = `${addedCount} ${countLabel}`;
        } else {
            stuffedDataEl.textContent = 'N/A';
            stuffingTypeEl.textContent = 'N/A';
            stuffedBitCountEl.textContent = '';
        }

        // Update other labels
        encodingTypeEl.textContent = encodingName;
        transmissionMediumLabel.textContent = transmissionType.charAt(0).toUpperCase() + transmissionType.slice(1);
        // signalCanvas.className = transmissionType; // Class might not be needed anymore
    }

    // --- Animation Helpers ---
    async function animateBitDrop(originalBitIndex, bitValue, isStuffedBit) {
        const sourceSpan = document.getElementById(`bin-in-${originalBitIndex}`);
        // Target the center of the visible encoder box span
        const encoderRect = encoderBox.getBoundingClientRect();
        const dropAreaRect = bitDropArea.getBoundingClientRect();

        if (!sourceSpan || !encoderRect.width) return; // Skip if source or target not ready

        const sourceRect = sourceSpan.getBoundingClientRect();

        const bitElement = document.createElement('span'); // Use span
        // Apply classes from the <style> block in HTML
        bitElement.className = 'bit-anim';
        if (isStuffedBit) {
            bitElement.classList.add('bit-anim-stuff');
            bitElement.title = 'Stuffed Bit';
        } else if (bitValue === '0') {
            bitElement.classList.add('bit-anim-0');
        } else {
            bitElement.classList.add('bit-anim-1');
        }
        bitElement.textContent = bitValue;
        bitDropArea.appendChild(bitElement);

        // Initial position: center of the source bit span, relative to dropArea
        const startX = sourceRect.left - dropAreaRect.left + sourceRect.width / 2 - bitElement.offsetWidth / 2;
        const startY = sourceRect.top - dropAreaRect.top + sourceRect.height / 2 - bitElement.offsetHeight / 2;

        // Target position: center of the encoder box span, relative to dropArea
        const targetX = encoderRect.left - dropAreaRect.left + encoderRect.width / 2 - bitElement.offsetWidth / 2;
        const targetY = encoderRect.top - dropAreaRect.top + encoderRect.height / 2 - bitElement.offsetHeight / 2;

        bitElement.style.left = `${startX}px`;
        bitElement.style.top = `${startY}px`;
        bitElement.style.opacity = '1';
        bitElement.style.transform = 'scale(1)';

        // Force reflow
        void bitElement.offsetWidth;

        // Animate to target
        bitElement.style.transition = `all ${animationSpeed * 0.8}ms ease-in-out`; // Use CSS transition
        bitElement.style.left = `${targetX}px`;
        bitElement.style.top = `${targetY}px`;
        bitElement.style.opacity = '0';
        bitElement.style.transform = 'scale(0.5)';

        // Wait for animation to roughly finish before removing
        await delay(animationSpeed * 0.8);

        if (bitElement.parentNode === bitDropArea) {
            bitDropArea.removeChild(bitElement);
        }
    }

    // Find original bit index corresponding to processed index (handling stuffing)
     function findOriginalBitIndex(processedIndex) {
        if (!needsStuffing) return processedIndex; // 1:1 mapping if no stuffing

        // If the processed index itself was a stuffed bit, it has no original index
        if (stuffedIndices.includes(processedIndex)) return -1;

        // Count how many non-stuffed bits came before or at this processedIndex
        let originalIndex = 0;
        for (let i = 0; i < processedIndex; i++) {
            if (!stuffedIndices.includes(i)) {
                originalIndex++;
            }
        }
         // Ensure the calculated index is within the bounds of the original binaryData
        return originalIndex < binaryData.length ? originalIndex : -1;
    }


    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }


    // --- Incremental Encoding/Decoding Functions ---
    function calculateEncodingForBit(bit, index) { return encodingFn(bit, index); }
    function calculateDecodingForBit(signalPointsForThisBit, index) { return decodingFn(signalPointsForThisBit, index); }

    // --- Bit-level Encoding Functions ---
    function encodeNRZLBit(bit, index) {
        const level = bit === '0' ? 1 : -1; // 0 -> High (+V), 1 -> Low (-V) - Standard NRZ-L
        return [{ time: index, level: level }];
    }
    function encodeNRZIBit(bit, index) {
        if (bit === '1') { // Transition on 1
            previousLevelNRZI *= -1;
        }
        // No transition on 0, level stays the same
        return [{ time: index, level: previousLevelNRZI }];
    }
    function encodeManchesterBit(bit, index) {
        const points = [];
        // 0: High-to-Low transition; 1: Low-to-High transition
        if (bit === '0') {
            points.push({ time: index + 0.0, level: 1 }); // Start High
            points.push({ time: index + 0.5, level: -1 }); // Transition Low mid-bit
        } else { // bit === '1'
            points.push({ time: index + 0.0, level: -1 }); // Start Low
            points.push({ time: index + 0.5, level: 1 }); // Transition High mid-bit
        }
        return points;
    }
    function encodeDiffManchesterBit(bit, index) {
        const points = [];
        // Transition at the start for 0, no transition for 1
        if (bit === '0') {
            levelBeforeIntervalDiffMan *= -1; // Invert level at the start
        }
        // Always transition in the middle
        points.push({ time: index + 0.0, level: levelBeforeIntervalDiffMan }); // Level for first half
        levelBeforeIntervalDiffMan *= -1; // Mid-bit transition
        points.push({ time: index + 0.5, level: levelBeforeIntervalDiffMan }); // Level for second half
        return points;
    }

    // --- Bit-level Decoding Functions ---
    function decodeNRZLSignal(points, index) {
        if (!points || points.length === 0) return '?';
        // High (+V) -> 0, Low (-V) -> 1
        return points[0].level === 1 ? '0' : '1';
    }
    function decodeNRZISignal(points, index) {
        if (!points || points.length === 0) return '?';
        const currentLevel = points[0].level;
        // Determine the level *before* this bit started
        let levelBeforeThisBit;
        if (index === 0) {
            levelBeforeThisBit = -1; // Assume starts low before first bit
        } else {
            // Find the last point of the previous bit interval
            const prevSignalIndex = signalDataPoints.length - points.length -1; // Index of last point of prev bit
             levelBeforeThisBit = prevSignalIndex >= 0 ? signalDataPoints[prevSignalIndex].level : -1;
        }
        // Transition occurred if levels differ -> 1, otherwise -> 0
        const decoded = (currentLevel !== levelBeforeThisBit) ? '1' : '0';
        return decoded;
    }
    function decodeManchesterSignal(points, index) {
        if (!points || points.length < 2 || points[0].time + 0.5 !== points[1].time) return '?'; // Expect two points per bit
        const firstHalfLevel = points[0].level;
        const secondHalfLevel = points[1].level;
        // High-to-Low (+1 -> -1) means 0
        if (firstHalfLevel === 1 && secondHalfLevel === -1) return '0';
        // Low-to-High (-1 -> +1) means 1
        if (firstHalfLevel === -1 && secondHalfLevel === 1) return '1';
        return '?'; // Invalid transition
    }
    function decodeDiffManchesterSignal(points, index) {
         if (!points || points.length < 2 || points[0].time + 0.5 !== points[1].time) return '?';
        const firstHalfLevel = points[0].level;
        // Determine the level at the *end* of the previous bit interval
        let levelBeforeThisBit;
         if (index === 0) {
            levelBeforeThisBit = -1; // Assume starts low before first bit
        } else {
            // Find the last point of the previous bit interval
            const prevSignalIndex = signalDataPoints.length - points.length - 1;
             levelBeforeThisBit = prevSignalIndex >= 0 ? signalDataPoints[prevSignalIndex].level : -1;
        }

        // If level at start of this bit is DIFFERENT from end of previous -> Transition -> 0
        if (firstHalfLevel !== levelBeforeThisBit) {
            return '0';
        } else { // Same level -> No transition -> 1
            return '1';
        }
    }


    // --- UI Update Helpers ---
    function highlightBinarySpan(parentElement, index, cssClass, append = false, isStuffedHighlight = false) {
        if (index === -1 && !append) return; // Don't highlight if index is invalid (e.g., source of stuffed bit)

        // Determine the prefix based on the parent element ID
        let spanIdPrefix = 'unknown-';
        if (parentElement === binaryInputAnimatedEl) spanIdPrefix = 'bin-in-';
        else if (parentElement === stuffedDataEl) spanIdPrefix = 'stuff-in-';
        else if (parentElement === decodedBinaryAnimatedEl) spanIdPrefix = 'dec-out-';

        // Determine the index to target
        const targetIndex = append ? decodedBits.length - 1 : index;
        const spanId = `${spanIdPrefix}${targetIndex}`;

        let span = parentElement.querySelector(`#${spanId}`);

        // --- Appending logic for decoded output ---
        if (append && parentElement === decodedBinaryAnimatedEl) {
             if (!span) { // Only append if span doesn't exist
                span = document.createElement('span');
                span.id = spanId;
                span.textContent = decodedBits[targetIndex]; // Get the just decoded bit
                parentElement.appendChild(span);
                // Add space every 8 bits for readability
                if ((targetIndex + 1) % 8 === 0 && targetIndex < totalSteps -1) { // Check against totalSteps
                    parentElement.appendChild(document.createTextNode(' '));
                }
            }
        }
        // --- End Appending Logic ---


        if (span) {
            // Define highlight classes using Tailwind
            const highlightClasses = {
                'highlight-current': 'bg-yellow-300',
                'highlight-processed': 'text-gray-400', // Example: Dim processed bits
                'highlight-decoded': 'bg-green-200',
                'highlight-error': 'bg-red-300 text-red-800 font-bold',
                'highlight-stuffed': 'text-amber-600 font-bold' // Already applied via classList in setup, but can be reapplied
            };

            // Remove existing highlight classes ONLY if not highlighting stuffed data specifically
             if (!isStuffedHighlight) {
                 Object.values(highlightClasses).forEach(cls => span.classList.remove(...cls.split(' ')));
             }


            // Add the new class if provided
            if (cssClass && highlightClasses[cssClass]) {
                 span.classList.add(...highlightClasses[cssClass].split(' '));
            }
        } else if (!append) {
             // console.warn(`Span not found for highlighting: ${spanId}`);
        }
    }


    // --- Canvas Drawing (Incorporating Bit Colors and Errors) ---
    function drawSignal(originalBits, currentSignalPoints, technique, bitsToShow, errors = []) {
        const width = signalCanvas.width;
        const height = signalCanvas.height;
        // Use constants defined earlier
        const usableWidth = width - 2 * H_PADDING;
        const usableHeight = height - 2 * V_PADDING;
        const timeScale = totalSteps > 0 ? usableWidth / totalSteps : usableWidth; // Use totalSteps for scaling

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#ffffff'; // White background
        ctx.fillRect(0, 0, width, height);

        // --- Draw Axes ---
        ctx.strokeStyle = COLOR_AXIS; ctx.lineWidth = 1; ctx.beginPath();
        ctx.moveTo(H_PADDING, V_PADDING / 2); ctx.lineTo(H_PADDING, height - V_PADDING / 2); // Y
        ctx.moveTo(H_PADDING, MID_Y); ctx.lineTo(width - H_PADDING, MID_Y); // X
        ctx.stroke();
        ctx.fillStyle = COLOR_AXIS; ctx.font = "11px Poppins"; ctx.textAlign = "right";
        ctx.fillText("+V", H_PADDING - 8, HIGH_Y + 4); // Adjusted Y pos
        ctx.fillText("0", H_PADDING - 8, MID_Y + 4);
        ctx.fillText("-V", H_PADDING - 8, LOW_Y + 4); // Adjusted Y pos

        // --- Draw Bit Boundaries and Labels ---
        ctx.lineWidth = 0.5; ctx.fillStyle = COLOR_TEXT; ctx.font = "10px monospace"; ctx.textAlign = "center";
        const isManchesterType = technique === 'manchester' || technique === 'diffmanchester';
        for (let i = 0; i <= totalSteps; i++) { // Iterate up to totalSteps
            const x = H_PADDING + i * timeScale;
            const isBoundaryToShow = i <= bitsToShow; // Show boundary if it's for a bit we've processed
            ctx.strokeStyle = isBoundaryToShow ? COLOR_BIT_BOUNDARY : COLOR_GRID; // Dim future boundaries
            ctx.setLineDash(isBoundaryToShow ? [4, 2] : []); // Dashed for processed boundaries
            ctx.beginPath(); ctx.moveTo(x, V_PADDING * 0.8); ctx.lineTo(x, height - V_PADDING * 0.8); ctx.stroke();
            ctx.setLineDash([]);

            // Label the bit interval (using original binary data index)
            if (i < bitsToShow && i < totalSteps) {
                 const originalSourceIndex = findOriginalBitIndex(i); // Find corresponding source bit index
                 const bitLabel = (originalSourceIndex !== -1 && originalSourceIndex < binaryData.length) ? binaryData[originalSourceIndex] : (stuffedIndices.includes(i) ? 'S' : '?'); // Label stuffed bits 'S'
                 const bitCenterX = H_PADDING + (i + 0.5) * timeScale;
                 ctx.fillText(bitLabel, bitCenterX, V_PADDING - 5); // Position label above
            }

            // Draw mid-bit transition lines for Manchester types
            if (isManchesterType && i < bitsToShow) {
                ctx.strokeStyle = COLOR_TRANSITION; ctx.setLineDash([2, 2]);
                const midX = H_PADDING + (i + 0.5) * timeScale;
                ctx.beginPath(); ctx.moveTo(midX, V_PADDING); ctx.lineTo(midX, height - V_PADDING); ctx.stroke();
                ctx.setLineDash([]);
            }
        }

        // --- Draw Signal ---
        if (!currentSignalPoints || currentSignalPoints.length === 0) return;

        ctx.lineWidth = 2.5;
        ctx.beginPath();
        // Start from the beginning or the last known point
        let lastX = H_PADDING;
        let lastY = MID_Y; // Assume start at 0 level visually before first bit
        ctx.moveTo(lastX, lastY);


        // Helper to get the corresponding bit value for a signal point's time
        const getBitValueForTime = (time) => {
            const bitIndex = Math.floor(time); // Get the bit index this time falls into
            if (bitIndex >= 0 && bitIndex < processedData.length) {
                return processedData[bitIndex];
            }
            return null; // Or some default if time is out of bounds
        };

        for (let i = 0; i < currentSignalPoints.length; i++) {
            const point = currentSignalPoints[i];
            const x = H_PADDING + point.time * timeScale;
            const y = MID_Y - point.level * SIGNAL_AMPLITUDE;

            // Determine the bit value corresponding to this segment start time
            const bitValue = getBitValueForTime(point.time);

            // Set color based on bit value for the upcoming segment
            let segmentColor = COLOR_TRANSITION; // Default/transition color
            if (bitValue === '0') segmentColor = COLOR_ZERO_BIT;
            else if (bitValue === '1') segmentColor = COLOR_ONE_BIT;

            // If it's a vertical transition (same time, different level)
            if (i > 0 && point.time === currentSignalPoints[i - 1].time && y !== lastY) {
                ctx.stroke(); // End previous segment
                ctx.beginPath();
                ctx.strokeStyle = COLOR_TRANSITION; // Vertical lines are always transition color
                ctx.moveTo(lastX, lastY);
                ctx.lineTo(lastX, y); // Draw vertical line
                ctx.stroke();
                ctx.beginPath(); // Start new segment
                ctx.moveTo(lastX, y);
                // Color for the next horizontal segment will be set in the next iteration or below
            }
            // If it's a horizontal segment
            else if (x > lastX) {
                 ctx.stroke(); // End previous segment
                 ctx.beginPath();
                 ctx.strokeStyle = segmentColor; // Set color for the horizontal line
                 ctx.moveTo(lastX, lastY); // Start from previous point's Y
                 ctx.lineTo(x, lastY); // Draw horizontal line to current time, same Y
                 ctx.stroke();
                 // If there's also a level change at this exact time (e.g. start of bit)
                 if (y !== lastY) {
                     ctx.beginPath();
                     ctx.strokeStyle = COLOR_TRANSITION; // Vertical is transition
                     ctx.moveTo(x, lastY);
                     ctx.lineTo(x, y); // Draw vertical line
                     ctx.stroke();
                 }
                 ctx.beginPath(); // Start new path for next segment
                 ctx.moveTo(x, y); // Position pen at the end of this segment
            }
            // If it's the very first point
            else if (i === 0) {
                 ctx.lineTo(x, y); // Line from initial (padding, MID_Y)
            }


            lastX = x;
            lastY = y;
        }
         // Complete the last segment if needed
        const endOfCurrentBitTime = bitsToShow;
        const endX = H_PADDING + endOfCurrentBitTime * timeScale;
        if (endX > lastX) {
            // Determine color for the final segment
            const lastBitValue = getBitValueForTime(Math.floor(currentSignalPoints[currentSignalPoints.length - 1].time));
            ctx.strokeStyle = lastBitValue === '0' ? COLOR_ZERO_BIT : (lastBitValue === '1' ? COLOR_ONE_BIT : COLOR_TRANSITION);
            ctx.lineTo(endX, lastY); // Draw final horizontal segment
        }
        ctx.stroke();


        // --- Draw Error Markers ---
        ctx.fillStyle = COLOR_ERROR;
        ctx.strokeStyle = COLOR_ERROR;
        ctx.lineWidth = 1.5;
        errors.forEach(errorIndex => {
            // Mark the bit interval where the error occurred
            const startX = H_PADDING + errorIndex * timeScale;
            const endX_ = H_PADDING + (errorIndex + 1) * timeScale;
            const midX_ = (startX + endX_) / 2;
            const markerY = V_PADDING - 15; // Position above bit labels

            // Draw Circle Marker
            ctx.beginPath();
            ctx.arc(midX_, markerY, 4, 0, Math.PI * 2);
            ctx.fill();

             // Optional: Draw X marker inside or instead
             // ctx.beginPath();
             // ctx.moveTo(midX_ - 3, markerY - 3); ctx.lineTo(midX_ + 3, markerY + 3);
             // ctx.moveTo(midX_ + 3, markerY - 3); ctx.lineTo(midX_ - 3, markerY + 3);
             // ctx.stroke();
        });

        // --- Draw Decoder Head Marker ---
        const decodeHeadX = H_PADDING + bitsToShow * timeScale;
        if (decodeHeadX <= width - H_PADDING + 1) { // Only draw if within bounds
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'; // Darker marker
            ctx.beginPath();
            const markerTopY = V_PADDING * 0.8;
            ctx.moveTo(decodeHeadX - 4, markerTopY);
            ctx.lineTo(decodeHeadX + 4, markerTopY);
            ctx.lineTo(decodeHeadX, markerTopY + 8); // Pointing down
            ctx.closePath();
            ctx.fill();
        }

    } // End drawSignal

    // --- Utility Functions ---
    function formatBinaryString(binStr) {
        if (!binStr) return '';
        // Add space every 8 bits
        return binStr.replace(/(.{8})/g, '$1 ').trim();
    }
    function textToBinary(text) {
        return text.split('').map(char => char.charCodeAt(0).toString(2).padStart(8, '0')).join('');
    }
    function binaryToText(binary) {
        let text = '';
        // Ensure length is multiple of 8 for proper conversion
        const paddedBinary = binary.padEnd(Math.ceil(binary.length / 8) * 8, '0');
        for (let i = 0; i < paddedBinary.length; i += 8) {
            const byte = paddedBinary.substr(i, 8);
            if (byte.length === 8) { // Ensure we have a full byte
                 try {
                    const charCode = parseInt(byte, 2);
                     // Allow printable ASCII, tabs, newlines, carriage returns
                     if (charCode >= 32 || [9, 10, 13].includes(charCode)) {
                         text += String.fromCharCode(charCode);
                     } else if (charCode !== 0){ // Ignore null bytes from padding
                         text += '?'; // Placeholder for non-printable/control chars
                     }
                 } catch (e) {
                    console.error("Error converting byte:", byte, e);
                    text += '?';
                 }
            }
        }
        return text;
    }

    // --- Detailed Stuffing/Destuffing Functions ---
    function bitStuffDetailed(data) {
        let count = 0;
        let stuffed = '';
        const stuffedIndices = []; // Store indices where '0' was inserted IN THE OUTPUT string
        let outputIndex = 0;
        for (const bit of data) {
            stuffed += bit;
            outputIndex++;
            if (bit === '1') {
                count++;
                if (count === 5) {
                    stuffed += '0'; // Stuff a 0
                    stuffedIndices.push(outputIndex); // Store index of the stuffed '0'
                    outputIndex++;
                    count = 0; // Reset count
                }
            } else {
                count = 0; // Reset count on 0
            }
        }
        return { stuffed, stuffedIndices };
    }
    function bitDestuff(data) {
        let count = 0;
        let destuffed = '';
        let skipNext = false;
        for (let i = 0; i < data.length; i++) {
            if (skipNext) {
                skipNext = false; // Skip the stuffed '0'
                continue;
            }
            const bit = data[i];
            destuffed += bit;
            if (bit === '1') {
                count++;
                // Check if the next bit is a '0' to potentially remove
                if (count === 5 && i + 1 < data.length && data[i + 1] === '0') {
                    skipNext = true; // Mark the next '0' for removal
                    count = 0; // Reset count after finding five 1s followed by 0
                } else if (count === 5) {
                    // If 5 ones are not followed by a 0, just reset count normally
                    count = 0;
                }
            } else { // bit === '0'
                count = 0; // Reset count on any 0 that wasn't skipped
            }
        }
        return destuffed;
    }
    function byteStuffDetailed(data, flag, esc) {
        let stuffed = flag; // Start with flag
        const stuffedIndices = []; // Store start indices where ESC was inserted
        const byteLength = 8;
        let outputIndex = flag.length; // Start tracking index after initial flag

        for (let i = 0; i < data.length; i += byteLength) {
            const byte = data.substr(i, byteLength);
            if (byte.length < byteLength) continue; // Skip incomplete bytes at the end

            if (byte === flag || byte === esc) {
                stuffed += esc; // Add escape character
                // Mark the start index of the inserted escape byte
                stuffedIndices.push(outputIndex);
                outputIndex += byteLength;
            }
            stuffed += byte; // Add the original byte (or the escaped one)
            outputIndex += byteLength;
        }
        stuffed += flag; // End with flag
        return { stuffed, stuffedIndices };
    }
    function byteDestuff(data, flag, esc) {
        let destuffed = '';
        const byteLength = 8;
        let i = 0;

        // Check and skip starting flag
        if (data.startsWith(flag)) {
            i = flag.length;
        } else {
            console.warn("Byte Destuff: No starting flag found.");
            // Attempt to proceed anyway? Or return error? For now, proceed.
        }

        // Process until the potential ending flag
        while (i < data.length - flag.length) {
            const currentByte = data.substr(i, byteLength);
            if (currentByte.length < byteLength) {
                 console.warn("Byte Destuff: Incomplete byte encountered before end flag.");
                 break; // Stop if incomplete byte found mid-stream
            }

            if (currentByte === esc) {
                i += byteLength; // Move past the escape byte
                const nextByte = data.substr(i, byteLength);
                if (nextByte.length < byteLength) {
                    console.warn("Byte Destuff: Incomplete byte after ESC character near end.");
                    break; // Stop if incomplete byte follows ESC
                }
                 // Only add the next byte if it's a valid escaped character (FLAG or ESC)
                 if (nextByte === flag || nextByte === esc) {
                    destuffed += nextByte;
                    i += byteLength; // Move past the escaped byte
                 } else {
                     console.warn("Byte Destuff: Invalid byte found after ESC:", nextByte);
                     // What to do here? Skip ESC and add nextByte? Or stop?
                     // For robustness, maybe just add the nextByte assuming it was data.
                     destuffed += nextByte;
                     i += byteLength;
                 }
            } else {
                // It's a regular data byte (should not be a flag here)
                 if (currentByte === flag) {
                     console.warn("Byte Destuff: Unexpected flag found mid-stream at index", i);
                     // Stop processing as the frame structure seems broken
                     break;
                 }
                destuffed += currentByte;
                i += byteLength;
            }
        }

        // Verify the ending flag (optional but good practice)
        if (i !== data.length - flag.length) {
             console.warn(`Byte Destuff: Processing stopped at index ${i}, expected end flag at ${data.length - flag.length}.`);
        } else if (!data.endsWith(flag)) {
             console.warn("Byte Destuff: No ending flag found where expected.");
        }

        return destuffed;
    }


}); // End DOMContentLoaded
