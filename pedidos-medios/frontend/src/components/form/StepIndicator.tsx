import React from 'react';

interface StepIndicatorProps {
  currentStep: number;
  totalSteps?: number;
  onStepClick?: (step: number) => void;
  maxStepVisited?: number;
}

const STEPS = [
  { step: 1, title: 'Contacto y Servicios', shortTitle: '1. Contacto' },
  { step: 2, title: 'Detalle de Solicitudes', shortTitle: '2. Detalle' },
  { step: 3, title: 'Adjuntos y Enlaces', shortTitle: '3. Adjuntos' },
  { step: 4, title: 'Resumen y Confirmación', shortTitle: '4. Confirmar' },
];

export const StepIndicator: React.FC<StepIndicatorProps> = ({
  currentStep,
  onStepClick,
  maxStepVisited = 1,
}) => {
  if (currentStep > 4) return null; // No mostrar en pantalla final

  return (
    <nav className="pedidos-step-indicator" aria-label="Progreso del formulario">
      <ol className="pedidos-step-list">
        {STEPS.map((s) => {
          const isCurrent = s.step === currentStep;
          const isCompleted = s.step < currentStep;
          const isClickable = onStepClick && s.step <= maxStepVisited && s.step !== currentStep;

          return (
            <li
              key={s.step}
              className={`pedidos-step-item ${isCurrent ? 'current' : ''} ${isCompleted ? 'completed' : ''} ${
                isClickable ? 'clickable' : ''
              }`}
              aria-current={isCurrent ? 'step' : undefined}
            >
              {isClickable ? (
                <button
                  type="button"
                  className="pedidos-step-btn"
                  onClick={() => onStepClick(s.step)}
                  title={`Ir al paso ${s.title}`}
                >
                  <span className="pedidos-step-num">{isCompleted ? '✓' : s.step}</span>
                  <span className="pedidos-step-label">{s.title}</span>
                </button>
              ) : (
                <div className="pedidos-step-static">
                  <span className="pedidos-step-num">{isCompleted ? '✓' : s.step}</span>
                  <span className="pedidos-step-label">{s.title}</span>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
