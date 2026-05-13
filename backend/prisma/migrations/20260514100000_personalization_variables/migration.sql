-- CreateEnum
CREATE TYPE "VariableDefinitionType" AS ENUM ('BUSINESS', 'CUSTOMER');

-- CreateTable
CREATE TABLE "VariableDefinition" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "businessId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "VariableDefinitionType" NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "defaultValue" TEXT NOT NULL DEFAULT '',
    "isEditable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VariableDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerVariableValue" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customerId" UUID NOT NULL,
    "variableDefinitionId" UUID NOT NULL,
    "value" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "CustomerVariableValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateVariableMapping" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "templateId" UUID NOT NULL,
    "placeholderIndex" INTEGER NOT NULL,
    "variableKey" TEXT NOT NULL,

    CONSTRAINT "TemplateVariableMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VariableDefinition_businessId_key_key" ON "VariableDefinition"("businessId", "key");
CREATE INDEX "VariableDefinition_businessId_idx" ON "VariableDefinition"("businessId");

CREATE UNIQUE INDEX "CustomerVariableValue_customerId_variableDefinitionId_key" ON "CustomerVariableValue"("customerId", "variableDefinitionId");
CREATE INDEX "CustomerVariableValue_variableDefinitionId_idx" ON "CustomerVariableValue"("variableDefinitionId");

CREATE UNIQUE INDEX "TemplateVariableMapping_templateId_placeholderIndex_key" ON "TemplateVariableMapping"("templateId", "placeholderIndex");
CREATE INDEX "TemplateVariableMapping_templateId_idx" ON "TemplateVariableMapping"("templateId");

-- AddForeignKey
ALTER TABLE "VariableDefinition" ADD CONSTRAINT "VariableDefinition_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerVariableValue" ADD CONSTRAINT "CustomerVariableValue_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerVariableValue" ADD CONSTRAINT "CustomerVariableValue_variableDefinitionId_fkey" FOREIGN KEY ("variableDefinitionId") REFERENCES "VariableDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TemplateVariableMapping" ADD CONSTRAINT "TemplateVariableMapping_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;
