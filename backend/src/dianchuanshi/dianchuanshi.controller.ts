import { Router, Request, Response } from "express";
import {
    getAllDianChuanShiService,
    getDianChuanShiByIdService,
    createDianChuanShiService,
    updateDianChuanShiService,
    deleteDianChuanShiService,
} from "./dianchuanshi.service";
import { Prisma } from "@prisma/client";
import { authenticateJWT } from "../middleware/authentication";
import { sendError, sendBadRequest } from "../utils/respond";

const router = Router();

router.use(authenticateJWT);

router.get("/", async (_req: Request, res: Response) => {
    try {
        const data = await getAllDianChuanShiService();
        res.json(data);
    } catch (error: any) {
        sendError(res, error);
    }
});

router.get("/:id", async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id);
        const data = await getDianChuanShiByIdService(id);
        res.json(data);
    } catch (error: any) {
        res.status(404).json({ message: error.message });
    }
});

router.post("/", async (req: Request, res: Response) => {
    try {
        const newPandita = await createDianChuanShiService(req.body as Prisma.DianChuanShiCreateInput);
        res.status(201).json({ message: "Pandita berhasil ditambahkan", data: newPandita });
    } catch (error: any) {
        sendBadRequest(res, error);
    }
});

router.patch("/:id", async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id);
        const updated = await updateDianChuanShiService(id, req.body as Prisma.DianChuanShiUpdateInput);
        res.json({ message: "Pandita berhasil diperbarui", data: updated });
    } catch (error: any) {
        sendBadRequest(res, error);
    }
});

router.delete("/:id", async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id);
        const result = await deleteDianChuanShiService(id);
        res.json(result);
    } catch (error: any) {
        sendBadRequest(res, error);
    }
});

export default router;