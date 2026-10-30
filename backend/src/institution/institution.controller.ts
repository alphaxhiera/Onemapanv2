import { Router, Request, Response } from "express";
import {
    getAllInstitutions,
    createInstitution,
    updateInstitution,
    deleteInstitution,
} from "./institution.service";
import { Prisma } from "@prisma/client";
import { authenticateJWT } from "../middleware/authentication";
import { sendError, sendBadRequest } from "../utils/respond";

const router = Router();

router.use(authenticateJWT);

router.get("/", async (_req: Request, res: Response) => {
    try {
        const data = await getAllInstitutions();
        res.json(data);
    } catch (error: any) {
        sendError(res, error);
    }
});

router.post("/", async (req: Request, res: Response) => {
    try {
        const newInst = await createInstitution(req.body as Prisma.InstitutionCreateInput);
        res.status(201).json(newInst);
    } catch (error: any) {
        sendBadRequest(res, error);
    }
});

router.patch("/:id", async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id);
        const updated = await updateInstitution(id, req.body as Prisma.InstitutionUpdateInput);
        res.json({ message: "Lembaga berhasil diperbarui", data: updated });
    } catch (error: any) {
        sendBadRequest(res, error);
    }
});

router.delete("/:id", async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id);
        await deleteInstitution(id);
        res.json({ message: "Lembaga berhasil dihapus" });
    } catch (error: any) {
        sendBadRequest(res, error);
    }
});

export default router;