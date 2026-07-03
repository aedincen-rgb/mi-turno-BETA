package one.miturno.twa;

import com.google.androidbrowserhelper.locationdelegation.LocationDelegationExtraCommandHandler;
import com.google.androidbrowserhelper.trusted.DelegationService;

/**
 * DelegationService con delegación de UBICACIÓN habilitada. Sin esto, Chrome
 * no muestra el diálogo de permiso de ubicación dentro del TWA verificado:
 * navigator.geolocation falla en silencio ("No pude leer tu ubicación").
 * Con el handler registrado, el pedido web dispara el diálogo NATIVO de
 * Android sobre la app, como en cualquier app nativa.
 */
public class DelegationServiceImpl extends DelegationService {

    @Override
    public void onCreate() {
        super.onCreate();
        registerExtraCommandHandler(new LocationDelegationExtraCommandHandler());
    }
}
