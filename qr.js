// QRリーダー (メニューの「教室番号を確認」を押したときに読み込まれる)
(() => {
    const ROOM_HOSTS = ["attendance.is.chibatech.ac.jp", "attendance.is.it-chiba.ac.jp"];
    const ROOM_PATH = /^\/attendance\/class_room\/(\d+)\/?$/;

    const dialog = document.getElementById("scanner");
    const video = document.getElementById("scannerVideo");
    const status = document.getElementById("scannerStatus");
    const result = document.getElementById("scannerResult");
    const number = document.getElementById("scannerNumber");

    let stream = null;
    let timer = null;
    let detect = null;

    // QRの中身から教室番号を取り出す
    function roomNumber(text) {
        try {
            const url = new URL(text);
            if (!ROOM_HOSTS.includes(url.hostname)) return null;
            const m = url.pathname.match(ROOM_PATH);
            return m ? m[1] : null;
        } catch (e) {
            return null;
        }
    }

    // 読み取り方法の準備 (対応ブラウザは標準機能、それ以外はjsQR)
    async function getDetector() {
        if ("BarcodeDetector" in window) {
            try {
                const formats = await BarcodeDetector.getSupportedFormats();
                if (formats.includes("qr_code")) {
                    const detector = new BarcodeDetector({ formats: ["qr_code"] });
                    return async () => {
                        const codes = await detector.detect(video);
                        return codes.map((c) => c.rawValue);
                    };
                }
            } catch (e) {
                // jsQRにフォールバック
            }
        }

        await new Promise((resolve, reject) => {
            const s = document.createElement("script");
            s.src = "lib/jsQR.min.js";
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        return async () => {
            const w = video.videoWidth;
            const h = video.videoHeight;
            if (!w || !h) return [];
            // 処理を軽くするため縮小して解析
            const scale = Math.min(1, 640 / Math.max(w, h));
            canvas.width = Math.round(w * scale);
            canvas.height = Math.round(h * scale);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = window.jsQR(img.data, img.width, img.height, {
                inversionAttempts: "dontInvert",
            });
            return code ? [code.data] : [];
        };
    }

    function stopCamera() {
        clearTimeout(timer);
        timer = null;
        if (stream) {
            stream.getTracks().forEach((t) => t.stop());
            stream = null;
        }
        video.srcObject = null;
    }

    async function scanLoop() {
        if (!stream) return;
        try {
            for (const text of await detect()) {
                const room = roomNumber(text);
                if (room) {
                    stopCamera();
                    number.textContent = room;
                    result.hidden = false;
                    return;
                }
                status.textContent = "教室のQRコードではありません";
            }
        } catch (e) {
            // 映像の準備中などは無視して続行
        }
        timer = setTimeout(scanLoop, 150);
    }

    async function start() {
        result.hidden = true;
        status.textContent = "教室のQRコードを枠内に映してください";

        if (!navigator.mediaDevices?.getUserMedia) {
            status.textContent = "この環境ではカメラを使用できません";
            return;
        }
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment" },
                audio: false,
            });
        } catch (e) {
            status.textContent =
                e && e.name === "NotAllowedError"
                    ? "カメラの使用が許可されていません"
                    : "カメラを起動できませんでした";
            return;
        }
        try {
            detect ??= await getDetector();
        } catch (e) {
            stopCamera();
            status.textContent = "QRリーダーを読み込めませんでした";
            return;
        }
        // 起動中に閉じられた場合
        if (!dialog.open) {
            stopCamera();
            return;
        }
        video.srcObject = stream;
        await video.play().catch(() => {});
        scanLoop();
    }

    function close() {
        dialog.close();
    }

    dialog.addEventListener("close", stopCamera);
    document.getElementById("scannerClose").addEventListener("click", close);
    document.getElementById("scannerResultClose").addEventListener("click", close);
    document.getElementById("scannerRetry").addEventListener("click", start);

    window.openScanner = () => {
        dialog.showModal();
        start();
    };
})();
