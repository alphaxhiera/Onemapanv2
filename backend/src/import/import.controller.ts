import express, { Request, Response } from "express";
import multer from "multer";
import { importUmatFromExcel, importQiudaoFromExcel } from "./import.service";
import { authenticateJWT } from "../middleware/authentication";
import { authorize } from "../middleware/authorization";
import { env } from "../config/env";
import { assertXlsxBuffer } from "../utils/file-types";

const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: env.uploadMaxFileSize * 2, files: 1 },
});

function handleFileMissing(res: Response) {
    return res.status(400).json({ message: "File tidak ditemukan dalam request" });
}

const handleImportError = (res: Response, error: any, fallback: string) => {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) {
        console.error(fallback, error);
    }
    res.status(statusCode).json({
        message: statusCode >= 500 ? fallback : error.message,
    });
};

router.post(
    "/umat",
    authenticateJWT,
    authorize({ feature: "umat", action: "create" }),
    upload.single("file"),
    (req: Request, res: Response) => {
        void (async () => {
            try {
                if (!req.file) return handleFileMissing(res);

                assertXlsxBuffer(req.file.buffer);
                const result = await importUmatFromExcel(req.file.buffer);
                res.status(200).json({ message: "Berhasil mengimpor data", detail: result });
            } catch (err: any) {
                handleImportError(res, err, "Gagal mengimpor data");
            }
        })();
    }
);

router.post(
    "/qiudao",
    authenticateJWT,
    authorize({ feature: "qiudao", action: "create" }),
    upload.single("file"),
    (req: Request, res: Response) => {
        void (async () => {
            try {
                if (!req.file) return handleFileMissing(res);

                assertXlsxBuffer(req.file.buffer);
                const result = await importQiudaoFromExcel(req.file.buffer);
                res.status(200).json({ message: "Berhasil mengimpor data Qiudao", detail: result });
            } catch (err: any) {
                handleImportError(res, err, "Gagal mengimpor data Qiudao");
            }
        })();
    }
);

export default router;
