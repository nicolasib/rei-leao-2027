CREATE TABLE "voto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dispositivo_id" uuid NOT NULL,
	"casa_id" text NOT NULL,
	"valor" smallint NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "voto_dispositivo_casa" UNIQUE("dispositivo_id","casa_id"),
	CONSTRAINT "voto_valor" CHECK ("voto"."valor" in (1, -1))
);
