export interface PodPreset {
    id: string;
    label: { en: string; hu: string };
    prompts: {
        id: string;
        label: { en: string; hu: string };
        text: { en: string; hu: string };
    }[];
}

export const POD_PRESETS: Record<string, PodPreset> = {
    tshirt: {
        id: 'tshirt',
        label: { en: 'T-Shirt', hu: 'Póló' },
        prompts: [
            {
                id: 'model_street',
                label: { en: 'Model on Street', hu: 'Modell az utcán' },
                text: {
                    en: "A realistic, high-quality photo of a stylish model wearing a white t-shirt with the design printed on the chest. The model is walking on a sunny urban street with blurred city background. Professional fashion photography, 8k resolution, detailed fabric texture.",
                    hu: "Egy valósághű, kiváló minőségű fotó egy stílusos modellről, aki fehér pólót visel, a mellkasán a nyomtatott mintával. A modell egy napos városi utcán sétál, elmosódott városi háttérrel. Professzionális divatfotózás, 8k felbontás, részletes szövet textúra."
                }
            },
            {
                id: 'flat_lay',
                label: { en: 'Flat Lay', hu: 'Kiterítve' },
                text: {
                    en: "A professional flat lay photography of a folded t-shirt on a wooden table, with the design clearly visible. Surrounded by minimal lifestyle accessories like sunglasses and a plant. Soft natural lighting, high detail.",
                    hu: "Professzionális 'flat lay' fotó egy összehajtott pólóról egy fa asztalon, a minta jól látható. Minimál életmód kiegészítőkkel körülvéve, mint napszemüveg és egy növény. Lágy természetes megvilágítás, nagy részletesség."
                }
            }
        ]
    },
    mug: {
        id: 'mug',
        label: { en: 'Mug', hu: 'Bögre' },
        prompts: [
            {
                id: 'table_morning',
                label: { en: 'Morning Coffee', hu: 'Reggeli Kávé' },
                text: {
                    en: "A close-up shot of a ceramic mug sitting on a cozy breakfast table, with the design wrapped around it. Steam rising from the coffee. Warm morning sunlight coming through a window. Realistic reflection and ceramic texture.",
                    hu: "Közeli felvétel egy kerámia bögréről egy hangulatos reggeliző asztalon, a minta körbeöleli. Gőzölög a kávé. Meleg reggeli napfény süt be az ablakon. Reális tükröződés és kerámia textúra."
                }
            },
            {
                id: 'hand_holding',
                label: { en: 'Hand Holding', hu: 'Kézben tartva' },
                text: {
                    en: "A first-person perspective of a hand holding the mug against a blurred nature background. The design is perfectly visible on the side. High quality lifestyle photography.",
                    hu: "Belső nézetű (FPS) fotó, ahogy egy kéz tartja a bögrét egy elmosódott természetes háttér előtt. A minta tökéletesen látható az oldalán. Minőségi életmód fotózás."
                }
            }
        ]
    },
    phone_case: {
        id: 'phone_case',
        label: { en: 'Phone Case', hu: 'Telefontok' },
        prompts: [
            {
                id: 'desk_setup',
                label: { en: 'Desk Setup', hu: 'Íróasztalon' },
                text: {
                    en: "A modern smartphone case lying face down on a sleek office desk next to a laptop and coffee. The design covers the back of the phone case entirely. Tech lifestyle photography, sharp focus.",
                    hu: "Egy modern okostelefon tok arccal lefelé egy elegáns íróasztalon, laptop és kávé mellett. A minta teljesen beborítja a tok hátulját. Tech életmód fotózás, éles fókusz."
                }
            },
            {
                id: 'mirror_selfie',
                label: { en: 'Mirror Selfie', hu: 'Tükörszelfi' },
                text: {
                    en: "A trendy mirror selfie showing a person holding the phone. The phone case with the design is the focal point. Urban fashion style, vibrant colors.",
                    hu: "Egy trendi tükörszelfi, ahol valaki a telefont tartja. A mintás telefontok a fókuszpont. Városi divat stílus, élénk színek."
                }
            }
        ]
    },
    pillow: {
        id: 'pillow',
        label: { en: 'Pillow', hu: 'Párna' },
        prompts: [
            {
                id: 'sofa_living',
                label: { en: 'Living Room Sofa', hu: 'Nappali Kanapé' },
                text: {
                    en: "A decorative throw pillow on a modern grey sofa in a stylish living room. The design is printed on the pillow fabric with realistic texture and lighting shadows. Interior design photography.",
                    hu: "Egy dekoratív díszpárna egy modern szürke kanapén egy stílusos nappaliban. A minta a párna szövetére van nyomtatva, reális textúrával és árnyékokkal. Lakberendezési fotózás."
                }
            }
        ]
    },
    canvas: {
        id: 'canvas',
        label: { en: 'Canvas Art', hu: 'Vászonkép' },
        prompts: [
            {
                id: 'wall_gallery',
                label: { en: 'Gallery Wall', hu: 'Galéria Fal' },
                text: {
                    en: "A large canvas print hanging on a clean white wall in a modern art gallery setting. Spotlights illuminating the artwork. The design is displayed as a high-quality painting.",
                    hu: "Egy nagy vászonkép egy tiszta fehér falon egy modern művészeti galériában. Spotlámpák világítják meg a műalkotást. A minta minőségi festményként jelenik meg."
                }
            }
        ]
    },
    bedding: {
        id: 'bedding',
        label: { en: 'Bedding Set', hu: 'Ágynemű' },
        prompts: [
            {
                id: 'bedroom_luxury',
                label: { en: 'Luxury Bedroom', hu: 'Luxus Hálószoba' },
                text: {
                    en: "A luxurious bedroom scene with a king-size bed. The duvet cover features the design in a repeating pattern or large print. Soft, inviting lighting, hotel quality photography.",
                    hu: "Egy luxus hálószoba jelenet franciaággyal. A paplanhuzaton a minta ismétlődő mintázatként vagy nagy nyomatként jelenik meg. Lágy, hívogató megvilágítás, szállodai minőségű fotózás."
                }
            }
        ]
    },
    curtain: {
        id: 'curtain',
        label: { en: 'Shower Curtain', hu: 'Zuhanyfüggöny' },
        prompts: [
            {
                id: 'bathroom_modern',
                label: { en: 'Modern Bathroom', hu: 'Modern Fürdő' },
                text: {
                    en: "A modern bathroom interior with a bathtub. The shower curtain is closed, displaying the full design clearly. Bright, clean lighting, spa atmosphere.",
                    hu: "Egy modern fürdőszoba belső tér káddal. A zuhanyfüggöny be van húzva, tisztán mutatva a teljes mintát. Világos, tiszta megvilágítás, spa hangulat."
                }
            }
        ]
    }
};
