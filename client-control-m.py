import requests
import json
from io import BytesIO

class ControlMClient:
    """Cliente para ejecutar Control-M desde Python"""
    
    def __init__(self):
        self.session = requests.Session()
    
    def execute_control_m_from_client(self, control_m_info):
        """
        Ejecutar Control-M desde el cliente usando la información obtenida de la API principal
        
        Args:
            control_m_info (dict): Información obtenida de la API principal
            
        Returns:
            dict: Resultado de la ejecución de Control-M
        """
        try:
            print(f"Ejecutando Control-M desde cliente: {control_m_info['url']}")
            
            # Convertir JSON a string y crear buffer
            json_string = json.dumps(control_m_info['jsonData'], indent=2)
            json_bytes = json_string.encode('utf-8')
            
            # Crear form-data
            files = {
                'definitionsFile': (
                    control_m_info['filename'],
                    BytesIO(json_bytes),
                    'application/json'
                )
            }
            
            # Configurar headers
            headers = control_m_info['headers']
            
            # Realizar la petición POST
            response = self.session.post(
                control_m_info['url'],
                files=files,
                headers=headers,
                timeout=30
            )
            
            print(f"Control-M ejecutado exitosamente. Status: {response.status_code}")
            
            return {
                'success': True,
                'status': response.status_code,
                'data': response.json() if response.headers.get('content-type', '').startswith('application/json') else response.text,
                'message': 'Control-M ejecutado exitosamente desde cliente'
            }
            
        except Exception as error:
            print(f"Error ejecutando Control-M desde cliente: {str(error)}")
            
            return {
                'success': False,
                'error': str(error),
                'status': getattr(error.response, 'status_code', 'N/A') if hasattr(error, 'response') else 'N/A',
                'message': 'Error ejecutando Control-M desde cliente'
            }
    
    def process_with_control_m(self, api_url, request_data):
        """
        Función completa: llamar a la API principal y ejecutar Control-M
        
        Args:
            api_url (str): URL de tu API principal
            request_data (dict): Datos para enviar a la API principal
            
        Returns:
            dict: Resultado completo del proceso
        """
        try:
            print("Llamando a la API principal...")
            
            # Llamar a la API principal
            response = self.session.post(
                api_url,
                json=request_data,
                headers={'Content-Type': 'application/json'},
                timeout=30
            )
            
            if response.status_code != 200:
                raise Exception(f"La API principal falló con status: {response.status_code}")
            
            api_response = response.json()
            
            if not api_response.get('success'):
                raise Exception("La API principal retornó error")
            
            print("API principal ejecutada exitosamente")
            print("Ejecutando Control-M desde cliente...")
            
            # Ejecutar Control-M desde el cliente
            control_m_result = self.execute_control_m_from_client(api_response['controlMInfo'])
            
            return {
                'apiResponse': api_response,
                'controlMResult': control_m_result,
                'success': True,
                'message': 'Proceso completo ejecutado exitosamente'
            }
            
        except Exception as error:
            print(f"Error en el proceso completo: {str(error)}")
            
            return {
                'success': False,
                'error': str(error),
                'message': 'Error en el proceso completo'
            }

# Ejemplo de uso
def main():
    client = ControlMClient()
    
    api_url = 'https://tu-url-railway.up.railway.app/save-json'
    request_data = {
        'ambiente': 'DEV',
        'token': 'tu-bearer-token',
        'filename': 'ejemplo-cliente-python',
        'jsonData': {
            'jobType': 'Job',
            'application': 'MiApp',
            'subApplication': 'SubApp'
        }
    }
    
    result = client.process_with_control_m(api_url, request_data)
    print("Resultado final:", json.dumps(result, indent=2))

if __name__ == "__main__":
    main()

