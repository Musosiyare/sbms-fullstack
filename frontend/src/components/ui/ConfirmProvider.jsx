import { createContext, useCallback, useContext, useRef, useState } from "react";
import Modal from "./Modal";
import Button from "./Button";
import { AlertTriangle } from "lucide-react";

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const resolver = useRef(null);

  const confirm = useCallback((options) => {
    setState({
      title: "Are you sure?",
      message: "",
      confirmText: "Confirm",
      cancelText: "Cancel",
      tone: "primary",
      ...options,
    });
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function handleClose(result) {
    setState(null);
    resolver.current?.(result);
    resolver.current = null;
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal open={!!state} onClose={() => handleClose(false)} title={state?.title} size="sm">
        {state && (
          <>
            <div className="flex gap-3">
              {state.tone === "danger" && <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={20} />}
              <p className="text-sm text-slate-600">{state.message}</p>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <Button variant="ghost" onClick={() => handleClose(false)}>
                {state.cancelText}
              </Button>
              <Button variant={state.tone === "danger" ? "danger" : "primary"} onClick={() => handleClose(true)}>
                {state.confirmText}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}
