import { Dialog } from "@ophidian/core";

class ProgressDialog extends Dialog {
    progressEl = this.contentEl.createEl("progress", {
        attr: { style: "width: 100%", max: "100" },
    });
    counterEl = this.contentEl.createDiv({ text: "0%" });
    setProgress(pct: number) {
        this.counterEl.textContent = `${pct}%`;
        this.progressEl.value = pct;
    }
    constructor(onClose: () => void) {
        super();
        this.progressEl.value = 0;
        this.okButton.detach();
        this.addCancelButton();
        this.onClose = onClose;
    }
}

export class Progress {
    aborted = false;
    progress: ProgressDialog;

    constructor(title: string, message: string) {
        this.progress = new ProgressDialog(() => (this.aborted = true))
            .setTitle(title)
            .setContent(message);
        this.progress.open();
    }

    async forEach<T>(collection: T[], func: (item: T, index: number, list: T[], progress: Progress) => Promise<void> | void) {
        try {
            if (this.aborted) return;
            let processed = 0;
            const range = collection.length;
            let accum = 0;
            let pct = 0;
            for (const item of collection) {
                await func(item, processed++, collection, this);
                if (this.aborted) return;
                accum += 100;
                if (accum > range) {
                    const remainder = accum % range;
                    const step = (accum - remainder) / range;
                    this.progress.setProgress((pct += step));
                    accum = remainder;
                }
            }
            if (pct < 100) this.progress.setProgress(100);
            return this;
        } finally {
            this.progress.onClose = () => null;
            this.progress.close();
        }
    }

    set title(text: string) {
        this.progress.setTitle(text);
    }
    set message(text: string) {
        this.progress.setContent(text);
    }
}
