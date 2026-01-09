// renderer.js
// Handles rendering of LaTeX using MathJax 3

class Renderer {
    constructor() { }

    // Main render function
    // Main render function
    render(content, targetElement, type = 'latex', desmosId = null) {
        this._clearError(targetElement);
        targetElement.innerHTML = '';

        let promise = Promise.resolve();

        if (desmosId || type === 'desmos') {
            const dContainer = document.createElement('div');
            // Ensure container takes full width/height if it's the only thing, or fixed height if mixed
            dContainer.style.width = '100%';
            if (content && content.trim()) {
                dContainer.style.height = '100%'; // Always full height for now, user can scroll if needed
                dContainer.style.marginBottom = '0';
            } else {
                dContainer.style.height = '100%';
            }
            targetElement.appendChild(dContainer);

            // Allow content to be the ID if type is desmos
            const id = desmosId || content;
            promise = promise.then(() => this.renderDesmos(id, dContainer));
        }

        if (content && type !== 'desmos') {
            const lContainer = document.createElement('div');
            lContainer.className = 'scale-wrapper'; // Use wrapper for scaling
            targetElement.appendChild(lContainer);
            promise = promise.then(() => this.renderLatex(content, lContainer));
        } else if (content && type === 'mixed') {
            // Mixed case where content is raw latex
            const lContainer = document.createElement('div');
            targetElement.appendChild(lContainer);
            promise = promise.then(() => this.renderLatex(content, lContainer));
        } else if (type === 'group') {
            // Render a mini split view preview for the card
            // We expect 'content' to actually be the entry object or children array passed specially,
            // but the renderer signature is (content, element, type).
            // For now, let's just render a placeholder or text, 
            // BUT actually the App renders the split view, so this is mostly for the CARD PREVIEW in the library.
            targetElement.innerHTML = `<div style="display:flex; height:100%; align-items:center; justify-content:center; color:#666; font-size:0.9rem;">
                <span style="font-size:1.5rem; margin-right:5px;">🗂️</span> Composite Card
            </div>`;
        }

        return promise;
    }

    renderDesmos(content, element) {
        element.innerHTML = '';

        let graphId = content.trim();
        // Simple extraction: if full URL, try to get ID. 
        // Desmos URLs: https://www.desmos.com/calculator/id
        const urlMatch = graphId.match(/calculator\/([a-zA-Z0-9]+)/);
        if (urlMatch) {
            graphId = urlMatch[1];
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'desmos-wrapper';
        wrapper.style.width = '100%';
        wrapper.style.height = '100%';
        wrapper.style.display = 'flex';
        wrapper.style.justifyContent = 'center';
        wrapper.style.alignItems = 'center';

        const iframe = document.createElement('iframe');
        iframe.src = `https://www.desmos.com/calculator/${graphId}?embed`;
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = '0';
        iframe.style.borderRadius = '8px';

        wrapper.appendChild(iframe);
        element.appendChild(wrapper);
        return Promise.resolve();
    }

    renderLatex(content, element) {
        try {
            if (!content) {
                element.innerHTML = '';
                return Promise.resolve();
            }

            let htmlContent = content.trim();

            // Auto-wrap in delimiters if not present
            const hasDelimiters = /^\s*(\\\[|\$\$|\\\(|\$)/.test(htmlContent);
            if (!hasDelimiters) {
                htmlContent = `\\[ ${htmlContent} \\]`;
            }

            // STRATEGY CHANGE:
            // Instead of reusing the element and trying to clear MathJax state,
            // we will WIPE the element and create a FRESH wrapper.
            // This guarantees MathJax sees a brand new DOM node every time.
            element.innerHTML = '';

            const wrapper = document.createElement('div');
            // Remove display: contents so it can have margins/transform
            wrapper.style.display = 'inline-block'; // Shrink wrap content
            wrapper.className = 'scale-wrapper';
            wrapper.innerHTML = htmlContent;
            element.appendChild(wrapper);

            // Check if MathJax is loaded and has the API ready
            if (window.MathJax && window.MathJax.typesetPromise) {
                // Determine if we need to clear? With a fresh node, we shouldn't need to,
                // but let's be safe and clear the PARENT if it was tracked.
                if (window.MathJax.typesetClear) {
                    try { MathJax.typesetClear([element]); } catch (e) { }
                }

                return MathJax.typesetPromise([wrapper]).catch((err) => {
                    // Try to recover by clearing and showing error
                    console.error("MathJax render failed:", err);
                    element.innerHTML = `<div style="color:red; padding:10px;">Render Error: ${err.message}</div><pre style="font-size:0.8rem; overflow:auto;">${this._escapeHtml(content)}</pre>`;
                    // Try to show error using the helper as well
                    this._showError(element, `MathJax Error: ${err.message}`);
                });
            } else {
                // MathJax library might not be loaded yet (e.g. offline or slow network)
                // In this case, we just leave the raw TeX (which we just set)
                // or we could try to warn.
                if (window.MathJax && !window.MathJax.typesetPromise) {
                    console.warn("MathJax script loaded but API not ready, or is just config.");
                } else if (!window.MathJax) {
                    console.warn("MathJax not found.");
                }
                return Promise.resolve();
            }

        } catch (e) {
            this._showError(element, `Error: ${e.message}`);
            return Promise.resolve();
        }
    }

    _showError(targetElement, message) {
        // Fallback to targetElement itself if no parent/container found (detached element case)
        const container = targetElement.closest('.preview-pane') || targetElement.parentElement || targetElement;

        let errorBox = container.querySelector('.render-error-msg');
        if (!errorBox) {
            errorBox = document.createElement('div');
            errorBox.className = 'render-error-msg';
            errorBox.style.cssText = `
                margin-top: 10px;
                padding: 10px;
                background: #fee2e2;
                border: 1px solid #ef4444;
                color: #b91c1c;
                border-radius: 8px;
                font-size: 0.9rem;
                font-family: monospace;
                white-space: pre-wrap;
            `;
            container.appendChild(errorBox);
        }
        errorBox.innerText = message;
        errorBox.style.display = 'block';
    }


    /**
     * Scales the content.
     * If requestedScale is provided, uses it.
     * If requestedScale is null/undefined, auto-calculates to fit container.
     * Returns an object { scale, fitWidthScale }
     */
    scaleContent(container, contentElement, requestedScale, options = {}) {
        if (!container || !contentElement) return { scale: 1, fitWidthScale: 1 };

        const {
            minScale = 0.05,
            maxScale = 10.0,
            padding = 40,
            isPreview = false
        } = options;

        // Reset to measure true size
        contentElement.style.transform = 'scale(1)';
        contentElement.style.margin = '0';
        contentElement.style.transformOrigin = '0 0';

        // Force layout measurement
        const contentWidth = contentElement.scrollWidth;
        const contentHeight = contentElement.scrollHeight;

        if (contentWidth === 0 || contentHeight === 0) return { scale: 1, fitWidthScale: 1 };

        const containerRect = container.getBoundingClientRect();

        // Use a strictly calculated content area
        const margin = isPreview ? 8 : padding; // Slimmer margin for previews
        const availableWidth = Math.max(0, containerRect.width - (margin * 2));
        const availableHeight = Math.max(0, containerRect.height - (margin * 2));

        const scaleX = availableWidth / contentWidth;
        const scaleY = availableHeight / contentHeight;

        // "Fit to Width" baseline
        const fitWidthScale = Math.min(scaleX, isPreview ? 1.0 : 3.0);

        // Auto-fit (default) tries to fit both dimensions for previews.
        let scale = requestedScale;
        if (!scale) {
            if (isPreview) {
                // For previews, we MUST fit both dimensions perfectly.
                scale = Math.min(scaleX, scaleY);
            } else {
                scale = scaleX;
            }
            // Cap auto-fit to 1.0 for previews to prevent pixelation
            scale = Math.min(scale, isPreview ? 1.0 : 3.0);
        }

        // Clamp final scale.
        const absoluteMin = Math.min(minScale, fitWidthScale);
        scale = Math.max(absoluteMin, Math.min(scale, maxScale));

        // Apply scale
        contentElement.style.transform = `scale(${scale})`;

        const scaledWidth = contentWidth * scale;
        const scaledHeight = contentHeight * scale;

        // Ensure the content element itself has its original size
        contentElement.style.width = `${contentWidth}px`;
        contentElement.style.height = `${contentHeight}px`;

        // REFINED CENTERING:
        // Clear all margins
        contentElement.style.margin = '0';

        // 2. Horizontal Centering
        if (scaledWidth < containerRect.width) {
            const offset = (containerRect.width - scaledWidth) / 2;
            contentElement.style.marginLeft = `${Math.floor(offset)}px`;
        } else {
            contentElement.style.marginLeft = '0px';
            // Allow expansion to the right for scrolls
            contentElement.style.marginRight = `${Math.ceil(scaledWidth - contentWidth)}px`;
        }

        // 3. Vertical Centering
        if (scaledHeight < containerRect.height) {
            const offset = (containerRect.height - scaledHeight) / 2;
            contentElement.style.marginTop = `${Math.floor(offset)}px`;
        } else {
            contentElement.style.marginTop = '0px';
            contentElement.style.marginBottom = `${Math.ceil(scaledHeight - contentHeight)}px`;
        }

        return { scale, fitWidthScale };
    }

    _clearError(targetElement) {
        const container = targetElement.closest('.preview-pane') || targetElement.parentElement;
        if (container) {
            const errorBox = container.querySelector('.render-error-msg');
            if (errorBox) {
                errorBox.style.display = 'none';
                errorBox.innerText = '';
            }
        }
    }
    _escapeHtml(text) {
        if (!text) return text;
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}

window.Renderer = Renderer;
