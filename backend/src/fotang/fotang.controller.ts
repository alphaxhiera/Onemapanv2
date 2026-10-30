import { Router, Request, Response } from "express";
import {
    getAllFotang,
    findFotangById,
    createFotang,
    updateFotang,
    deleteFotang,
} from "../fotang/fotang.service";
import { Prisma } from "@prisma/client";
import { fetchCities, fetchDistricts, fetchLocalities, fetchProvinces } from "../profile/location/location.service";
import { authenticateJWT } from "../middleware/authentication";
import { sendError, sendBadRequest } from "../utils/respond";

const router = Router();

router.use(authenticateJWT);

router.get("/", async (_req: Request, res: Response) => {
    try {
        const fotangs = await getAllFotang();
        res.status(200).json(fotangs);
    } catch (error: any) {
        sendError(res, error);
    }
});

router.get("/provinces", async (_req: Request, res: Response) => {
    try {
        const provinces = await fetchProvinces();
        res.json(provinces);
    } catch (error: any) {
        sendError(res, error);
    }
});

router.get("/cities", (req, res) => {
    void (async () => {
        const provinceId = parseInt(req.query.provinceId as string);

        try {
        const cities = await fetchCities(provinceId);
        res.json(cities);
        } catch (error: any) {
        sendError(res, error);
        }
    })();
});

router.get("/districts", (req, res) => {
    void (async () => {
        const cityId = parseInt(req.query.cityId as string);

        try {
        const districts = await fetchDistricts(cityId);
        res.json(districts);
        } catch (error: any) {
        sendError(res, error);
        }
    })();
});

router.get("/localities", (req, res) => {
    void (async () => {
        const districtId = parseInt(req.query.districtId as string);

        try {
        const localities = await fetchLocalities(districtId);
        res.json(localities);
        } catch (error: any) {
        sendError(res, error);
        }
    })();
});

router.get("/:id", async (req, res) => {
    void (async () => {
        try {
            const id = parseInt(req.params.id);
            const fotang = await findFotangById(id);
    
            if (!fotang) {
            return res.status(404).json({ message: "Fotang tidak ditemukan" });
            }
    
            res.status(200).json(fotang);
        } catch (error: any) {
            sendError(res, error);
        }
    })();
});

router.post("/", async (req: Request, res: Response) => {
    try {
        const newFotang = await createFotang(req.body as Prisma.FotangCreateInput);
        res.status(201).json(newFotang);
    } catch (error: any) {
        console.error("Error create:", error);
        sendBadRequest(res, error);
    }
});

router.patch("/:id", async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id);
        const updatedFotang = await updateFotang(id, req.body as Prisma.FotangUpdateInput);

        res.status(200).json({
        message: "Fotang berhasil diperbarui",
        data: updatedFotang,
        });
    } catch (error: any) {
        sendBadRequest(res, error);
    }
});

router.delete("/:id", async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id);
        await deleteFotang(id);
        res.status(200).json({ message: "Fotang berhasil dihapus" });
    } catch (error: any) {
        sendBadRequest(res, error);
    }
});

export default router;
