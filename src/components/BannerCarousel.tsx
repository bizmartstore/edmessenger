import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";

export interface Banner {
  id: string;
  image_url: string;
  sort_order: number;
}

export function BannerCarousel() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [api, setApi] = useState<CarouselApi>();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("banners")
        .select("id, image_url, sort_order")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      setBanners((data ?? []) as Banner[]);
    })();
  }, []);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setIndex(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  // Auto-advance every 4s
  useEffect(() => {
    if (!api || banners.length < 2) return;
    const id = window.setInterval(() => {
      if (api.canScrollNext()) api.scrollNext();
      else api.scrollTo(0);
    }, 4000);
    return () => window.clearInterval(id);
  }, [api, banners.length]);

  if (banners.length === 0) return null;

  return (
    <div className="mt-4 relative">
      <Carousel setApi={setApi} opts={{ loop: true, align: "start" }} className="w-full">
        <CarouselContent className="-ml-0">
          {banners.map((b) => (
            <CarouselItem key={b.id} className="pl-0 basis-full">
              <div className="w-full overflow-hidden rounded-2xl bg-muted shadow-card">
                <img
                  src={b.image_url}
                  alt=""
                  className="w-full h-auto max-h-48 object-contain mx-auto block"
                  loading="lazy"
                />
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
      {banners.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-2">
          {banners.map((b, i) => (
            <button
              key={b.id}
              type="button"
              aria-label={`Banner ${i + 1}`}
              onClick={() => api?.scrollTo(i)}
              className={`h-1.5 rounded-full transition-all ${i === index ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/30"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
