// renderer.js
// Handles rendering of LaTeX using MathJax 3

class Renderer {
    constructor() { }

    // Main render function
    render(content, targetElement) {
        this._clearError(targetElement);
        this.renderLatex(content, targetElement);
    }

    renderLatex(content, element) {
        try {
            // Set content
            // Ensure we wrap it in delimiters if not present? 
            // MathJax expects delimiters for Tex input usually, but we can also use tex2chtml directly if we wanted.
            // However, the typesetPromise approach works best on the DOM element.

            // For stability, let's just put the raw content in, and let MathJax parse it.
            // But if the user types just "x^2", MathJax won't render unless it has delimiters.
            // We should auto-wrap if no delimiters are detected, OR just assume the user provides them?
            // User's previous input had delimiters. Let's support both.

            let htmlContent = content;
            if (!content.trim().startsWith('\\[')) {
                // Weak check, but let's try to be helpful. 
                // Actually, standardizing on just putting the text in and asking MathJax to typeset is safer.
            }

            element.innerHTML = htmlContent;

            if (window.MathJax) {
                // Determine if this is a re-render or initial
                // MathJax 3 uses typesetPromise
                MathJax.typesetPromise([element]).catch((err) => {
                    this._showError(element, `MathJax Error: ${err.message}`);
                });
            }

        } catch (e) {
            this._showError(element, `Error: ${e.message}`);
        }
    }

    _showError(targetElement, message) {
        const container = targetElement.closest('.preview-pane') || targetElement.parentElement;
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
}

window.Renderer = Renderer;
